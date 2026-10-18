'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { getDeviceLocation, getServerDeviceLocation, subscribeDeviceLocation, validFix, REPORT_FIX_LIFETIME_MS } from '@/lib/deviceLocation';
import { isWithinCordovaMapBounds } from '@/lib/cordovaBoundary';
import { useNearbyDetection } from '@/hooks/useNearbyDetection';
import { NearbyDetectionStatus } from '@/components/shared/NearbyDetectionStatus';
import type { ResponseService } from '@/lib/services/incidentService';
const LocationMap = dynamic(() => import('./LocationMap').then(module => module.LocationMap), { ssr: false });
const services: ResponseService[] = ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'];

export function CitizenNearbyMap() {
  const location = useSyncExternalStore(subscribeDeviceLocation, getDeviceLocation, getServerDeviceLocation);
  const [service, setService] = useState<ResponseService | 'ALL'>('ALL');
  const [, refreshAge] = useState(0);
  const timestamp = location.fix?.timestamp;
  useEffect(() => { if (!timestamp) return; const timer = setTimeout(() => refreshAge(value => value + 1), Math.max(0, timestamp + REPORT_FIX_LIFETIME_MS - Date.now())); return () => clearTimeout(timer); }, [timestamp]);
  const fix = !location.permissionDenied && location.fix && validFix(location.fix, REPORT_FIX_LIFETIME_MS)
    && isWithinCordovaMapBounds(location.fix.latitude, location.fix.longitude) ? location.fix : null;
  const detection = useNearbyDetection(fix ? { kind: 'citizen', latitude: fix.latitude, longitude: fix.longitude, services: service === 'ALL' ? services : [service] } : null);
  return <section aria-labelledby="nearby-heading" className="mb-8 min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
    <h2 id="nearby-heading" className="text-lg font-bold">Nearby submitted reports</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">100 m around your latest valid GPS fix. Other citizens’ identities, exact pins and reports stay private.</p>
    <label className="mt-3 block text-sm font-semibold">Response service
      <select value={service} onChange={event => setService(event.target.value as typeof service)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <option value="ALL">All response services</option>{services.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    {!fix ? <p role="status" className="mt-3 text-sm">Nearby detection needs a fresh GPS fix. A preliminary estimate cannot be used. Use the dashboard’s location retry if needed.</p>
      : <><NearbyDetectionStatus detection={detection} /><LocationMap latitude={fix.latitude} longitude={fix.longitude} navigable height="260px" nearbyLabel={detection.result?.nearby ? 'Submitted report within 100 m' : undefined} />
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Device accuracy estimate: {Math.round(fix.accuracy)} m. The circle is not GPS accuracy or the affected area. Similarity is by requested service, not proof of the same emergency.</p></>}
  </section>;
}
