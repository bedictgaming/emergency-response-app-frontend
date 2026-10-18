'use client';
import { useEffect, useState } from 'react';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { subscribeEmergencyStream, type EmergencyConnectionState } from '@/lib/emergencyEventStream';
import { detectNearby, type NearbyDetectionInput, type NearbyDetectionResult } from '@/lib/services/nearbyDetectionService';

type State = { key: string; result?: NearbyDetectionResult; phase: 'checking' | 'ready' | 'unavailable'; connection: EmergencyConnectionState };
const identity = () => `${adminAccountSnapshot()}:${typeof window === 'undefined' ? '' : localStorage.getItem('emergency-logout-epoch')}`;

/** Event-driven reads; never infer a nearby emergency from the event itself. */
export function useNearbyDetection(input: NearbyDetectionInput | null, enabled = true) {
  const requestKey = input ? JSON.stringify(input) : '';
  const account = identity();
  const key = `${account}:${requestKey}`;
  const [state, setState] = useState<State>({ key: '', phase: 'checking', connection: 'connecting' });
  useEffect(() => {
    if (!enabled || !requestKey || !adminAccountSnapshot()) return;
    let disposed = false, running = false, pending = false, lastStarted = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const valid = () => !disposed && identity() === account;
    const visible = () => document.visibilityState === 'visible' && navigator.onLine;
    const invalidate = () => { controller?.abort(); if (valid()) setState(s => ({ ...s, key, result: undefined, phase: 'unavailable' })); };
    const run = async () => {
      timer = undefined;
      if (!valid() || !visible()) return;
      running = true; pending = false; lastStarted = Date.now();
      controller = new AbortController();
      try {
        const result = await detectNearby(JSON.parse(requestKey), controller.signal);
        if (valid() && visible()) setState(s => ({ ...s, key, result, phase: 'ready' }));
      } catch { if (valid()) setState(s => ({ ...s, key, result: undefined, phase: 'unavailable' })); }
      finally { running = false; if (pending && valid()) schedule(); }
    };
    const schedule = () => {
      if (!valid() || !visible()) return;
      if (running) { pending = true; return; }
      if (timer) return;
      // Bursts coalesce: normally 100 ms, at most one read per 3 s per visible anchor.
      timer = setTimeout(() => { void run(); }, Math.max(100, lastStarted + 3000 - Date.now()));
    };
    setState({ key, phase: 'checking', connection: 'connecting' });
    const unsubscribe = subscribeEmergencyStream({ refresh: schedule, nearby: schedule,
      state: connection => {
        if (!valid()) return;
        setState(s => ({ ...s, key, connection, ...(connection !== 'live' ? { result: undefined, phase: 'unavailable' as const } : {}) }));
        if (connection === 'live') schedule();
      } });
    schedule();
    const foreground = () => { if (visible()) schedule(); else invalidate(); };
    const storage = () => { if (!valid()) { disposed = true; controller?.abort(); unsubscribe(); setState({ key: '', phase: 'unavailable', connection: 'signed-out' }); } };
    window.addEventListener('online', foreground); window.addEventListener('offline', foreground);
    window.addEventListener('focus', foreground); window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', foreground);
    const fallback = setInterval(schedule, 30_000);
    return () => { disposed = true; controller?.abort(); clearTimeout(timer); clearInterval(fallback); unsubscribe();
      window.removeEventListener('online', foreground); window.removeEventListener('offline', foreground);
      window.removeEventListener('focus', foreground); window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', foreground); };
  }, [requestKey, account, key, enabled]);
  return enabled && requestKey && state.key === key ? state : { key, phase: 'checking' as const, connection: 'connecting' as const, result: undefined };
}
