'use client';
import { useEffect, useState } from 'react';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { getDeviceLocation, subscribeDeviceLocation, validFix, type DeviceFix } from '@/lib/deviceLocation';
import { isWithinCordovaMapBounds } from '@/lib/cordovaBoundary';
import { subscribeEmergencyStream } from '@/lib/emergencyEventStream';
import { citizenPresenceUiEnabled, leavePresence, presenceCapability, refreshPresence } from '@/lib/services/citizenPresenceService';
import { PRESENCE_SHARING, type CitizenPresenceLayer } from '@/lib/citizenPresenceLocations';

type Phase = 'off' | 'connecting' | 'live' | 'paused' | 'gps-required' | 'unavailable';
const account = (userId: string | undefined) => `${PRESENCE_SHARING}:${userId}:${adminAccountSnapshot()}:${typeof window === 'undefined' ? '' : localStorage.getItem('emergency-logout-epoch')}`;

export function useCitizenPresence(userId: string | undefined) {
  const identity = account(userId), enabled = citizenPresenceUiEnabled && !!userId
    && adminAccountSnapshot()?.startsWith(`${userId}:USER:`) === true;
  const [capability, setCapability] = useState<{ identity: string; available: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  // Per-tab explicit consent only. Neither GPS nor permission to report opts in.
  const [consent, setConsent] = useState<string | null>(null);
  const [state, setState] = useState<{ identity: string; phase: Phase; layer?: CitizenPresenceLayer }>({ identity: '', phase: 'off' });
  const available = capability?.identity === identity ? capability.available : null;
  const sharing = enabled && available === true && consent === identity;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void presenceCapability(controller.signal).then(value => { if (!controller.signal.aborted && account(userId) === identity) setCapability({ identity, available: value }); })
      .catch(() => { if (!controller.signal.aborted && account(userId) === identity) setCapability({ identity, available: false }); });
    return () => controller.abort();
  }, [enabled, identity, userId, retry]);
  useEffect(() => {
    if (!sharing) return;
    let dead = false, live = false, suspended = false, running = false, pending = false, mustWrite = true;
    let visit: string | null = null, generation = 0, lastStarted = 0;
    let publishedFix: DeviceFix | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined, expires: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const valid = () => !dead && account(userId) === identity;
    const visible = () => !suspended && navigator.onLine && document.visibilityState === 'visible';
    const halt = (phase: Phase) => {
      generation++; controller?.abort(); clearTimeout(timer); timer = undefined; clearTimeout(expires);
      if (visit) leavePresence(visit); visit = null; publishedFix = null; mustWrite = true; pending = false;
      if (valid()) setState({ identity, phase });
    };
    const run = async () => {
      timer = undefined;
      if (!valid() || !live || !visible()) return;
      const location = getDeviceLocation(), fix = location.fix;
      if (location.permissionDenied || !fix || !validFix(fix, 60_000) || !isWithinCordovaMapBounds(fix.latitude, fix.longitude)) { halt('gps-required'); return; }
      if (!visit) { visit = crypto.randomUUID(); mustWrite = true; }
      const requestVisit = visit, currentGeneration = generation, write = mustWrite;
      mustWrite = false; pending = false; running = true; lastStarted = Date.now(); controller = new AbortController();
      try {
        const snapshot = await refreshPresence(requestVisit, write ? fix : null, controller.signal);
        if (!valid() || currentGeneration !== generation || visit !== requestVisit || !live || !visible()) return;
        if (write) publishedFix = fix;
        if (!publishedFix) return;
        setState({ identity, phase: 'live', layer: { latitude: publishedFix.latitude, longitude: publishedFix.longitude, positions: snapshot.positions } });
        clearTimeout(expires); expires = setTimeout(() => halt('unavailable'), snapshot.expiresInSeconds * 1000);
      } catch {
        if (valid() && currentGeneration === generation) halt('unavailable');
      } finally {
        running = false;
        if (pending && valid()) schedule();
      }
    };
    const schedule = () => {
      if (!valid() || !live || !visible()) return;
      if (running) { pending = true; return; }
      if (!timer) timer = setTimeout(() => { void run(); }, Math.max(100, lastStarted + 1500 - Date.now()));
    };
    const beat = () => { mustWrite = true; schedule(); };
    const unsubscribe = subscribeEmergencyStream({ refresh: () => {}, presence: schedule, state: next => {
      live = next === 'live';
      if (!live) halt(next === 'signed-out' ? 'off' : 'connecting'); else beat();
    } });
    const stop = () => { suspended = true; halt('paused'); };
    const resume = () => { suspended = false; if (visible()) beat(); };
    const visibility = () => { if (document.visibilityState !== 'visible' || !navigator.onLine) stop(); else resume(); };
    const storage = () => { if (!valid()) { halt('off'); setConsent(null); } };
    const unsubscribeGps = subscribeDeviceLocation(beat);
    const interval = setInterval(beat, 10_000);
    window.addEventListener('pagehide', stop); window.addEventListener('pageshow', resume);
    window.addEventListener('offline', stop); window.addEventListener('online', resume); window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('freeze', stop); document.addEventListener('resume', resume);
    return () => {
      dead = true; halt('off'); unsubscribe(); unsubscribeGps(); clearInterval(interval);
      window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', resume);
      window.removeEventListener('offline', stop); window.removeEventListener('online', resume); window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('freeze', stop); document.removeEventListener('resume', resume);
    };
  }, [sharing, identity, userId]);
  const current = sharing && state.identity === identity ? state : { phase: sharing ? 'connecting' as const : 'off' as const, layer: undefined };
  return { enabled, available, sharing, phase: current.phase, layer: current.phase === 'live' ? current.layer : undefined,
    start: () => setConsent(identity), stop: () => setConsent(null), retry: () => setRetry(value => value + 1) };
}
export type CitizenPresence = ReturnType<typeof useCitizenPresence>;
