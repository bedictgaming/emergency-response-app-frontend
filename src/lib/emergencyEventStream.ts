import { API_ORIGIN, ensureFreshSession, isDefinitiveAuthFailure } from '@/lib/apiClient';
import { getMe } from '@/lib/services/authService';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';

export type EmergencyConnectionState = 'connecting' | 'live' | 'recovering' | 'offline' | 'signed-out';
type Listener = { refresh: () => void; state?: (state: EmergencyConnectionState) => void };
const streams = new Map<string, { subscribe: (listener: Listener) => () => void }>();

// Events are invalidation hints, never authority to sound an emergency alarm.
export function subscribeEmergencyStream(listener: Listener) {
  const identity = `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}`;
  let stream = streams.get(identity);
  if (!stream) {
    const listeners = new Set<Listener>();
    let source: EventSource | null = null, timer: number | null = null;
    let stopped = false, checking = false, attempts = 0, suspended = false, lifecycle = 0;
    let state: EmergencyConnectionState = 'connecting';
    const valid = () => !stopped && identity === `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}`;
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
      try { await ensureFreshSession(); }
      catch (error) {
        if (!valid() || started !== lifecycle) return;
        if (isDefinitiveAuthFailure(error)) { stopped = true; broadcast('signed-out'); }
        else { broadcast('recovering'); retry(); }
        return;
      } finally {
        checking = false;
        if (started !== lifecycle && canConnect()) retry();
      }
      if (!canConnect() || started !== lifecycle) return;
      const next = new EventSource(`${API_ORIGIN}/api/events/v1/stream`, { withCredentials: true });
      source = next;
      for (const name of ['incident.created', 'incident.updated', 'incident.verified', 'dispatch.updated', 'task.updated', 'alert.created']) next.addEventListener(name, refresh);
      next.onopen = () => {
        if (!valid() || source !== next) { next.close(); return; }
        attempts = 0; broadcast('live'); refresh();
      };
      next.onerror = () => {
        if (source !== next) return;
        close(); broadcast(navigator.onLine ? 'recovering' : 'offline');
        if (!canConnect() || checking) return;
        checking = true;
        void getMe().catch(error => {
          if (valid() && isDefinitiveAuthFailure(error)) { stopped = true; broadcast('signed-out'); }
        }).finally(() => { checking = false; retry(); });
      };
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
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    window.addEventListener('pagehide', pause); window.addEventListener('pageshow', resume);
    window.addEventListener('focus', visible);
    document.addEventListener('freeze', pause); document.addEventListener('resume', resume);
    document.addEventListener('visibilitychange', visible);
    stream = { subscribe(item) {
      listeners.add(item); item.state?.(state);
      if (listeners.size === 1) void connect();
      return () => {
        listeners.delete(item);
        if (!listeners.size) {
          stopped = true; close(); streams.delete(identity);
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
