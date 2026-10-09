import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { type DeviceFix, getDeviceLocation, getServerDeviceLocation, refreshDeviceLocation,
  subscribeDeviceLocation, validFix, RECENT_FIX_MS, REPORT_FIX_LIFETIME_MS } from '@/lib/deviceLocation';

export type ReportGpsFix = DeviceFix;
export function isReportGpsFresh(fix: ReportGpsFix | null): boolean {
  return fix !== null && validFix(fix, REPORT_FIX_LIFETIME_MS);
}
export function useReportGps() {
  const shared = useSyncExternalStore(subscribeDeviceLocation, getDeviceLocation, getServerDeviceLocation);
  const [fix, setFix] = useState<ReportGpsFix | null>(null);
  const [expired, setExpired] = useState(false);
  const [minimumGeneration, setMinimumGeneration] = useState(0);
  // Capture once. Continuous updates must not move a confirmed report pin.
  useEffect(() => {
    if (shared.permissionDenied) { setFix(null); return; }
    if (!fix && !expired && shared.fix && !validFix(shared.fix, RECENT_FIX_MS)) {
      refreshDeviceLocation();
      return;
    }
    if (!fix && !expired && shared.generation >= minimumGeneration
      && shared.fix && validFix(shared.fix, RECENT_FIX_MS)) setFix(shared.fix);
  }, [shared, fix, expired, minimumGeneration]);
  useEffect(() => {
    if (!fix) return;
    const timer = setTimeout(() => { setFix(null); setExpired(true); },
      Math.max(0, fix.timestamp + REPORT_FIX_LIFETIME_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [fix]);
  const refresh = useCallback(() => {
    setFix(null); setExpired(false);
    setMinimumGeneration(getDeviceLocation().generation + 1);
    refreshDeviceLocation();
  }, []);
  const usableFix = shared.permissionDenied ? null : fix;
  return { fix: usableFix, loading: !usableFix && !expired && shared.loading,
    error: expired ? 'This GPS fix has expired. Refresh GPS and confirm your location again.' : usableFix ? null : shared.error,
    preliminary: !usableFix && shared.estimate !== null, refresh };
}
