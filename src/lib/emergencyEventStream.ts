import { API_ORIGIN, ensureFreshSession, isDefinitiveAuthFailure, markSessionEnded, SESSION_CHANGED_EVENT } from '@/lib/apiClient';
import { accountHome } from '@/lib/authorization';
import { getMeFresh } from '@/lib/services/authService';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { createEmergencyTransport, type EmergencyTransport } from '@/lib/emergencyTransport';

export type EmergencyConnectionState = 'connecting' | 'live' | 'recovering' | 'offline' | 'signed-out';
type Listener = { refresh: () => void; users?: () => void; nearby?: () => void; presence?: () => void; state?: (state: EmergencyConnectionState) => void };
const streamIdentity = () => `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}`;
const streams = new Map<string, { subscribe: (listener: Listener) => () => void; reconnect: () => void }>();

/** Rebind the shared authenticated transport, not another GPS watcher/socket. */
export function reconnectEmergencyStream() { streams.get(streamIdentity())?.reconnect(); }

// Events are invalidation hints, never authority to sound an emergency alarm.
export function subscribeEmergencyStream(listener: Listener) {
  const identity = streamIdentity();
  let stream = streams.get(identity);
  if (!stream) {
    const listeners = new Set<Listener>();
    let source: EmergencyTransport | null = null, timer: number | null = null;
    let stopped = false, checking = false, attempts = 0, suspended = false, lifecycle = 0;
    let state: EmergencyConnectionState = 'connecting';
    const valid = () => !stopped && identity === streamIdentity();
    const canConnect = () => valid() && !suspended && navigator.onLine && document.visibilityState === 'visible';
    const broadcast = (next: EmergencyConnectionState) => { state = next; listeners.forEach(item => item.state?.(next)); };
    const refresh = () => { if (valid()) listeners.forEach(item => item.refresh()); };
    const close = () => { source?.close(); source = null; if (timer !== null) window.clearTimeout(timer); timer = null; };
    const retry = () => {
      if (!canConnect() || timer !== null) return;
      timer = window.setTimeout(() => { timer = null; void connect(); }, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
    };
    const connect = async () => {
      if (!valid() || source || checking || suspended) return;
      if (!navigator.onLine) { broadcast('offline'); return; }
      if (document.visibilityState !== 'visible') return;
      const started = lifecycle;
      checking = true;
      try { await ensureFreshSession();
        if (!canConnect() || started !== lifecycle) return;
        const next = await createEmergencyTransport(API_ORIGIN);
        if (!canConnect() || started !== lifecycle) { next.close(); return; }
        source = next;
        for (const name of ['incident.created', 'incident.updated', 'incident.verified', 'dispatch.updated', 'task.updated', 'alert.created']) next.addEventListener(name, refresh);
        // A peer report is never an ordinary citizen event or alarm trigger.
        next.addEventListener('nearby.changed', () => { if (valid()) listeners.forEach(item => item.nearby?.()); });
        // Online citizens are not incident arrivals, alarms or report data.
        next.addEventListener('presence.changed', () => { if (valid()) listeners.forEach(item => item.presence?.()); });
        // User administration is not an emergency or a siren trigger.
        next.addEventListener('users.changed', () => { if (valid()) listeners.forEach(item => item.users?.()); });
        next.onopen = () => {
          if (!valid() || source !== next) { next.close(); return; }
          attempts = 0; broadcast('live'); refresh();
        };
        next.onerror = () => {
          if (source !== next) return;
          close(); broadcast(navigator.onLine ? 'recovering' : 'offline');
          if (!canConnect() || checking) return;
          checking = true;
          const generation = localStorage.getItem('emergency-session-generation');
          const sameSession = () => valid() && generation === localStorage.getItem('emergency-session-generation');
          void getMeFresh().then(user => {
            if (!sameSession()) return;
            const cached = JSON.parse(localStorage.getItem('user') ?? 'null');
            // A stream check cannot adopt a different account. Keep the normal
            // account boundary/explicit switch flow in charge of that change.
            if (cached?.id !== user.id) { stopped = true; broadcast('signed-out'); return; }
            if (cached?.role !== user.role || (cached?.department ?? null) !== (user.department ?? null) || Boolean(cached?.isMainAdmin) !== Boolean(user.isMainAdmin)) {
              stopped = true;
              localStorage.setItem('user', JSON.stringify(user));
              window.location.replace(accountHome(user));
            }
          }).catch(error => {
            if (sameSession() && isDefinitiveAuthFailure(error)) {
              stopped = true; broadcast('signed-out');
              localStorage.removeItem('user'); localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken');
              markSessionEnded();
              window.location.replace('/');
            }
          }).finally(() => { checking = false; retry(); });
        };
        next.start();
      }
      catch (error) {
        if (!valid() || started !== lifecycle) return;
        if (isDefinitiveAuthFailure(error)) { stopped = true; broadcast('signed-out'); }
        else { broadcast('recovering'); retry(); }
        return;
      } finally {
        checking = false;
        if (started !== lifecycle && canConnect()) retry();
      }
    };
    const pause = () => { lifecycle += 1; suspended = true; close(); broadcast(navigator.onLine ? 'recovering' : 'offline'); };
    const offline = () => { lifecycle += 1; close(); broadcast('offline'); };
    const resume = () => {
      suspended = false;
      if (!canConnect() || source) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      attempts = 0;
      void connect();
    };
    const visible = () => {
      // Healthy background connections still deliver alerts. Failed ones wait
      // for a visible, online page instead of retrying during browser suspension.
      if (document.visibilityState === 'visible' && !suspended) resume();
      else if (timer !== null) { window.clearTimeout(timer); timer = null; }
    };
    const online = () => resume();
    const rebind = () => {
      lifecycle += 1; close();
      if (!valid()) { stopped = true; broadcast('signed-out'); return; }
      broadcast(navigator.onLine ? 'recovering' : 'offline');
      retry(); // Existing visibility/online/backoff and fresh-session checks.
    };
    const sessionStorage = (event: StorageEvent) => {
      if (!event.key || ['emergency-session-generation', 'emergency-logout-epoch', 'user'].includes(event.key)) rebind();
    };
    window.addEventListener(SESSION_CHANGED_EVENT, rebind); window.addEventListener('storage', sessionStorage);
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    window.addEventListener('pagehide', pause); window.addEventListener('pageshow', resume);
    window.addEventListener('focus', visible);
    document.addEventListener('freeze', pause); document.addEventListener('resume', resume);
    document.addEventListener('visibilitychange', visible);
    stream = { reconnect: rebind, subscribe(item) {
      listeners.add(item); item.state?.(state);
      if (listeners.size === 1) void connect();
      return () => {
        listeners.delete(item);
        if (!listeners.size) {
          stopped = true; close(); streams.delete(identity);
          window.removeEventListener(SESSION_CHANGED_EVENT, rebind); window.removeEventListener('storage', sessionStorage);
          window.removeEventListener('offline', offline); window.removeEventListener('online', online);
          window.removeEventListener('pagehide', pause); window.removeEventListener('pageshow', resume);
          window.removeEventListener('focus', visible);
          document.removeEventListener('freeze', pause); document.removeEventListener('resume', resume);
          document.removeEventListener('visibilitychange', visible);
        }
      };
    } };
    streams.set(identity, stream);
  }
  return stream.subscribe(listener);
}
