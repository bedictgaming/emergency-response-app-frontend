'use client';
import { useEffect, useRef, useState } from 'react';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { getDeviceLocation, subscribeDeviceLocation, validFix, type DeviceFix } from '@/lib/deviceLocation';
import { isWithinCordovaMapBounds } from '@/lib/cordovaBoundary';
import { reconnectEmergencyStream, subscribeEmergencyStream } from '@/lib/emergencyEventStream';
import { citizenPresenceUiEnabled, leavePresence, presenceCapability, refreshPresence } from '@/lib/services/citizenPresenceService';
import { PRESENCE_SHARING, type CitizenPresenceLayer } from '@/lib/citizenPresenceLocations';
import { loadPresencePreference, savePresencePreference, presencePreferenceKey, PRESENCE_PREFERENCE_EVENT, type PresencePreference } from '@/lib/citizenPresencePreference';

type Phase = 'off' | 'connecting' | 'live' | 'paused' | 'gps-required' | 'unavailable' | 'reconnect-required';
const account = (userId: string | undefined) => {
  try { return `${PRESENCE_SHARING}:${userId}:${adminAccountSnapshot()}:${typeof window === 'undefined' ? '' : localStorage.getItem('emergency-logout-epoch')}`; }
  catch { return ''; }
};

export function useCitizenPresence(userId: string | undefined) {
  const identity = account(userId), enabled = citizenPresenceUiEnabled && !!userId
    && adminAccountSnapshot()?.startsWith(`${userId}:USER:`) === true;
  const [capability, setCapability] = useState<{ identity: string; available: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  // A new explicit choice is remembered per account/browser, not authorization.
  // Server capability, session, visibility, WebSocket and fresh GPS still gate it.
  const [preference, setPreference] = useState<(PresencePreference & { identity: string }) | null>(null);
  const preferenceRef = useRef<(PresencePreference & { identity: string }) | null>(null);
  const [state, setState] = useState<{ identity: string; phase: Phase; layer?: CitizenPresenceLayer }>({ identity: '', phase: 'off' });
  const available = capability?.identity === identity ? capability.available : null;
  const preferenceEnabled = enabled && preference?.identity === identity && preference.enabled;
  const preferenceError = enabled && preference?.identity === identity ? preference.error : null;
  const sharing = available === true && preferenceEnabled;
  useEffect(() => {
    if (!enabled) { preferenceRef.current = null; return; }
    const key = presencePreferenceKey(userId);
    const sync = () => {
      // An unsaved Stop must stay stopped locally even if storage recovers or
      // another tab updates profile metadata. Only an explicit retry clears it.
      if (account(userId) === identity && preferenceRef.current?.identity === identity && preferenceRef.current.error === 'stop') return;
      const value = account(userId) === identity ? loadPresencePreference(userId) : { enabled: false, error: null };
      if (preferenceRef.current?.identity !== identity || preferenceRef.current.enabled !== value.enabled)
        setState({ identity, phase: value.enabled ? 'connecting' : 'off' });
      preferenceRef.current = { identity, ...value };
      setPreference({ identity, ...value });
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === key || event.key === 'user' || event.key === 'emergency-logout-epoch') sync();
    };
    const local = (event: Event) => { if ((event as CustomEvent).detail === key) sync(); };
    sync();
    window.addEventListener('storage', storage); window.addEventListener(PRESENCE_PREFERENCE_EVENT, local);
    return () => {
      preferenceRef.current = null;
      window.removeEventListener('storage', storage); window.removeEventListener(PRESENCE_PREFERENCE_EVENT, local);
    };
  }, [enabled, identity, userId]);
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
    let conflictRetried = false, conflictBlocked = false;
    let visit: string | null = null, generation = 0, lastStarted = 0;
    let publishedFix: DeviceFix | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined, expires: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const valid = () => !dead && account(userId) === identity
      && preferenceRef.current?.identity === identity && preferenceRef.current.enabled;
    const visible = () => !suspended && navigator.onLine && document.visibilityState === 'visible';
    const halt = (phase: Phase) => {
      generation++; controller?.abort(); clearTimeout(timer); timer = undefined; clearTimeout(expires);
      if (visit) leavePresence(visit); visit = null; publishedFix = null; mustWrite = true; pending = false;
      if (valid()) setState({ identity, phase });
    };
    const run = async () => {
      timer = undefined;
      if (!valid() || !live || !visible() || conflictBlocked) return;
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
        conflictRetried = false;
        setState({ identity, phase: 'live', layer: { latitude: publishedFix.latitude, longitude: publishedFix.longitude, positions: snapshot.positions } });
        clearTimeout(expires); expires = setTimeout(() => halt('unavailable'), snapshot.expiresInSeconds * 1000);
      } catch (error: unknown) {
        if (valid() && currentGeneration === generation) {
          const conflict = (error as { response?: { status?: number } })?.response?.status === 409;
          // Never bypass the socket/visit/timestamp guard or spin on every GPS
          // callback. One fresh transport attempt, then explicit recovery.
          if (conflict && conflictRetried) conflictBlocked = true;
          halt(conflictBlocked ? 'reconnect-required' : 'unavailable');
          if (conflict && !conflictRetried) { conflictRetried = true; reconnectEmergencyStream(); }
        }
      } finally {
        running = false;
        if (pending && valid()) schedule();
      }
    };
    const schedule = () => {
      if (!valid() || !live || !visible() || conflictBlocked) return;
      if (running) { pending = true; return; }
      if (!timer) timer = setTimeout(() => { void run(); }, Math.max(100, lastStarted + 1500 - Date.now()));
    };
    const beat = () => { mustWrite = true; schedule(); };
    const unsubscribe = subscribeEmergencyStream({ refresh: () => {}, presence: schedule, state: next => {
      live = next === 'live';
      if (!live) halt(next === 'signed-out' ? 'off' : conflictBlocked ? 'reconnect-required' : 'connecting'); else beat();
    } });
    const stop = () => { suspended = true; halt('paused'); };
    const resume = () => { suspended = false; if (visible()) { conflictBlocked = false; conflictRetried = false; beat(); } };
    const visibility = () => { if (document.visibilityState !== 'visible' || !navigator.onLine) stop(); else resume(); };
    const storage = () => { if (!valid()) halt('off'); };
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
  }, [sharing, identity, userId, retry]);
  const current = sharing && state.identity === identity ? state : { phase: sharing ? 'connecting' as const : 'off' as const, layer: undefined };
  const choose = (on: boolean) => {
    if (!enabled || account(userId) !== identity || on && available !== true) return;
    const value = savePresencePreference(userId, on);
    // Invalidate pending location work synchronously, before React's cleanup.
    preferenceRef.current = { identity, ...value };
    // A new visit must not resurrect the last visit's expired map snapshot.
    setState({ identity, phase: value.enabled ? 'connecting' : 'off' });
    setPreference({ identity, ...value });
    if (!value.error) window.dispatchEvent(new CustomEvent(PRESENCE_PREFERENCE_EVENT, { detail: presencePreferenceKey(userId) }));
  };
  return { enabled, available, sharing, preferenceEnabled, preferenceError, phase: current.phase, layer: current.phase === 'live' ? current.layer : undefined,
    start: () => choose(true), stop: () => choose(false), retry: () => setRetry(value => value + 1) };
}
export type CitizenPresence = ReturnType<typeof useCitizenPresence>;
