'use client';
import { useEffect, useRef } from 'react';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { subscribeEmergencyStream } from '@/lib/emergencyEventStream';

/** Coalesced event-driven reads, with foreground/reconnect/outage recovery. */
export function useLiveRefresh(onRefresh: () => void | Promise<void>, enabled: boolean, includeUsers = false) {
  const callback = useRef(onRefresh);
  useEffect(() => { callback.current = onRefresh; }, [onRefresh]);
  useEffect(() => {
    if (!enabled) return;
    const account = adminAccountSnapshot(), logout = localStorage.getItem('emergency-logout-epoch');
    let disposed = false, running = false, pending = false, lastStarted = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const valid = () => !disposed && account === adminAccountSnapshot() && logout === localStorage.getItem('emergency-logout-epoch');
    const visible = () => navigator.onLine && document.visibilityState === 'visible';
    const schedule = () => {
      if (!valid() || !visible()) return;
      if (running) { pending = true; return; }
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!valid() || !visible()) return;
        running = true; pending = false; lastStarted = Date.now();
        void Promise.resolve().then(() => callback.current()).catch(() => {
          // The owning surface retains its loaded data and error/retry state.
        }).finally(() => { running = false; if (pending) schedule(); });
      }, Math.max(100, lastStarted + 1000 - Date.now()));
    };
    const unsubscribe = subscribeEmergencyStream({ refresh: schedule, ...(includeUsers && { users: schedule }) });
    const fallback = setInterval(schedule, 30_000);
    window.addEventListener('focus', schedule); window.addEventListener('online', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      disposed = true; clearTimeout(timer); clearInterval(fallback); unsubscribe();
      window.removeEventListener('focus', schedule); window.removeEventListener('online', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [enabled, includeUsers]);
}
