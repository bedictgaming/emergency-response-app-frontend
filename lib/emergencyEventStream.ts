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
    let stopped = false, checking = false, attempts = 0;
    let state: EmergencyConnectionState = 'connecting';
    const valid = () => !stopped && identity === `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}`;
    const broadcast = (next: EmergencyConnectionState) => { state = next; listeners.forEach(item => item.state?.(next)); };
    const refresh = () => { if (valid()) listeners.forEach(item => item.refresh()); };
    const close = () => { source?.close(); source = null; if (timer !== null) window.clearTimeout(timer); timer = null; };
    const retry = () => {
      if (!valid() || !navigator.onLine) return;
      timer = window.setTimeout(() => { timer = null; void connect(); }, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
    };
    const connect = async () => {
      if (!valid() || source || checking) return;
      if (!navigator.onLine) { broadcast('offline'); return; }
      checking = true;
      try { await ensureFreshSession(); }
      catch (error) {
        if (isDefinitiveAuthFailure(error)) { stopped = true; broadcast('signed-out'); }
        else { broadcast('recovering'); retry(); }
        return;
      } finally { checking = false; }
      if (!valid()) return;
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
        if (!valid() || !navigator.onLine) return;
        checking = true;
        void getMe().catch(error => {
          if (isDefinitiveAuthFailure(error)) { stopped = true; broadcast('signed-out'); }
        }).finally(() => { checking = false; retry(); });
      };
    };
    const offline = () => { close(); broadcast('offline'); };
    const online = () => { close(); attempts = 0; refresh(); void connect(); };
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    stream = { subscribe(item) {
      listeners.add(item); item.state?.(state);
      if (listeners.size === 1) void connect();
      return () => {
        listeners.delete(item);
        if (!listeners.size) {
          stopped = true; close(); streams.delete(identity);
          window.removeEventListener('offline', offline); window.removeEventListener('online', online);
        }
      };
    } };
    streams.set(identity, stream);
  }
  return stream.subscribe(listener);
}
