// In-memory only. A coarse/cached estimate is never a report-authorizing fix.
export interface DeviceFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}
const INITIAL = { estimate: null as DeviceFix | null, fix: null as DeviceFix | null,
  loading: true, error: null as string | null, permissionDenied: false, generation: 0 };
let state = INITIAL;
const listeners = new Set<() => void>();
let watch: number | null = null;
let generation = 0;
let deadline: ReturnType<typeof setTimeout> | null = null;
const TIMEOUT = 20_000;
export const RECENT_FIX_MS = 5000;
export const REPORT_FIX_LIFETIME_MS = 5 * 60_000;
export function validFix(fix: DeviceFix, age: number): boolean {
  return Number.isFinite(fix.latitude) && Math.abs(fix.latitude) <= 90
    && Number.isFinite(fix.longitude) && Math.abs(fix.longitude) <= 180
    && Number.isFinite(fix.accuracy) && fix.accuracy >= 0
    && Number.isFinite(fix.timestamp) && fix.timestamp <= Date.now() + 5000
    && Date.now() - fix.timestamp < age;
}
const emit = (next: typeof INITIAL) => { state = next; listeners.forEach(listener => listener()); };
function cancel() {
  if (deadline) clearTimeout(deadline);
  deadline = null;
  if (watch !== null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(watch);
  watch = null;
}
function read(position: GeolocationPosition): DeviceFix {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude,
    accuracy: position.coords.accuracy, timestamp: position.timestamp };
}
export function refreshDeviceLocation() {
  const request = ++generation;
  cancel();
  emit({ ...state, fix: null, loading: true, error: null, permissionDenied: false, generation: request });
  const active = () => request === generation && listeners.size > 0;
  const fail = (code: number) => {
    if (!active()) return;
    if (deadline) clearTimeout(deadline);
    deadline = null;
    const denied = code === 1;
    if (denied) { ++generation; cancel(); }
    emit({ ...state, fix: null, estimate: denied ? null : state.estimate, loading: false,
      permissionDenied: denied, error: denied
        ? 'Location permission is blocked. Allow location in your browser site settings, then retry.'
        : code === 3 ? 'GPS timed out. Turn on Location Services, move near a window, then retry. If you opened this in Messenger, try your phone browser.'
        : 'Your device could not determine its location. Turn on Location Services and retry.' });
  };
  if (!navigator.geolocation) { fail(2); return; }
  deadline = setTimeout(() => fail(3), TIMEOUT);
  try {
    const id = navigator.geolocation.watchPosition(position => {
      if (!active()) return;
      const fix = read(position);
      if (!validFix(fix, RECENT_FIX_MS)) {
        if (!state.fix) emit({ ...state, error: 'The device returned an invalid or old GPS fix. Refresh GPS and try again.', loading: false });
        return;
      }
      if (deadline) clearTimeout(deadline);
      deadline = null;
      emit({ ...state, estimate: fix, fix, loading: false, error: null });
    }, error => fail(error.code), { enableHighAccuracy: true, maximumAge: 0, timeout: TIMEOUT });
    if (active()) watch = id; else navigator.geolocation.clearWatch(id);
    if (!active()) return;
    navigator.geolocation.getCurrentPosition(position => {
      if (!active() || state.fix) return;
      const estimate = read(position);
      if (validFix(estimate, 30_000)) emit({ ...state, estimate });
    }, error => { if (error.code === 1) fail(1); },
    { enableHighAccuracy: false, maximumAge: 30_000, timeout: 5000 });
  } catch { fail(2); }
}
export function subscribeDeviceLocation(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) refreshDeviceLocation();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { ++generation; cancel(); state = INITIAL; }
  };
}
export const getDeviceLocation = () => state;
export const getServerDeviceLocation = () => INITIAL;
