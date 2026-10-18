'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import { LoadingPlaceholder } from '@/components/ui/loading-placeholder';
import { isWithinCordovaMapBounds } from '@/lib/cordovaBoundary';
import { useNearbyDetection } from '@/hooks/useNearbyDetection';
import { NearbyDetectionStatus } from './NearbyDetectionStatus';
import { NearbyReportDialog } from '@/components/admin/NearbyReportDialog';

const LocationMap = dynamic(() => import('../citizen/LocationMap').then(module => module.LocationMap), {
  ssr: false,
  loading: () => <LoadingPlaceholder label="Loading incident map..." layout="map" className="h-[260px]" />,
});

// Compact, always-open adaptation of the Watermelon view-on-map card.
// https://registry.watermelon.sh/r/view-on-map.json
// Keep Leaflet/OSM; omit the original pill, Google iframe and stock photo.
export function IncidentLocationMap({ latitude, longitude, operationalIncidentId }: {
  latitude?: number | null;
  longitude?: number | null;
  operationalIncidentId?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [inViewport, setInViewport] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const detection = useNearbyDetection(operationalIncidentId ? { kind: 'department', incidentId: operationalIncidentId } : null, inViewport);
  const displayedLatitude = detection.result?.center?.latitude ?? latitude;
  const displayedLongitude = detection.result?.center?.longitude ?? longitude;
  const valid = typeof latitude === 'number' && typeof longitude === 'number'
    && isWithinCordovaMapBounds(latitude, longitude);

  useEffect(() => {
    if (!valid || !container.current) return;
    if (!('IntersectionObserver' in window)) { setNearViewport(true); setInViewport(true); return; }
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      setInViewport(visible);
      if (visible) setNearViewport(true);
    }, { rootMargin: '200px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [valid]);

  if (!valid) return (
    <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Map unavailable: this report has no valid recorded coordinates.</p>
  );

  return (
    <div ref={container} className="mt-4 min-w-0" role="group" aria-label="Reported emergency location">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"><MapPin className="h-4 w-4 text-red-600" aria-hidden="true" />Incident location</span>
        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300">{displayedLatitude!.toFixed(6)}, {displayedLongitude!.toFixed(6)}</span>
      </div>
      {operationalIncidentId && <NearbyDetectionStatus detection={detection} />}
      {nearViewport
        ? <LocationMap latitude={displayedLatitude!} longitude={displayedLongitude!} navigable height="260px"
            nearbyPins={detection.result?.items} onNearbyReport={setReviewId} />
        : <LoadingPlaceholder label="Incident map loads when visible" layout="map" className="h-[260px]" />}
      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{operationalIncidentId ? '100 m nearby detection around the selected report' : '100 m around the reported pin · visual reference only'} · not the affected area or GPS accuracy. Cordova outline is approximate.</p>
      {detection.result?.items?.length ? <ul className="mt-2 space-y-1" aria-label="Authorized nearby reports">
        {detection.result.items.map(pin => <li key={pin.incidentId}><button type="button" className="min-h-11 rounded-lg px-2 text-left text-sm font-semibold text-red-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-red-600" onClick={() => setReviewId(pin.incidentId)}>Review nearby report · {pin.services.join(' / ')} · {pin.distanceMeters} m</button></li>)}
      </ul> : null}
      {operationalIncidentId && <NearbyReportDialog incidentId={reviewId} onClose={() => setReviewId(null)} />}
    </div>
  );
}
