'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Expand, MapPin } from 'lucide-react';
import { LoadingPlaceholder } from '@/components/ui/loading-placeholder';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isWithinCordovaMapBounds } from '@/lib/cordovaBoundary';
import { useNearbyDetection } from '@/hooks/useNearbyDetection';
import { NearbyDetectionStatus } from './NearbyDetectionStatus';
import { NearbyReportDialog } from '@/components/admin/NearbyReportDialog';
import { nearbyReviewUiEnabled } from '@/lib/services/nearbyReviewService';
import { NearbyReportPopupContent } from '@/components/admin/NearbyReportPopupContent';
import { ExpandedMap } from '@/components/ui/expanded-map';
import { formatNearbyReportDistance } from '@/lib/reportDistance';
import IncidentReviewActions from '@/components/admin/IncidentReviewActions';
import type { Incident } from '@/lib/services/incidentService';
import type { ReportPinReviewControl } from '@/types/report-pin-review';

const LocationMap = dynamic(() => import('../citizen/LocationMap').then(module => module.LocationMap), {
  ssr: false,
  loading: () => <LoadingPlaceholder label="Loading incident map..." layout="map" className="h-[260px]" />,
});

// Compact inline map with an optional focused, in-app map viewer.
// https://registry.watermelon.sh/r/view-on-map.json
// Keep Leaflet/OSM; never send the report to an external map tab/iframe.
export function IncidentLocationMap({ latitude, longitude, operationalIncidentId, reviewIncident, onReviewChanged }: {
  latitude?: number | null;
  longitude?: number | null;
  operationalIncidentId?: string;
  reviewIncident?: Incident;
  onReviewChanged?: () => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [inViewport, setInViewport] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [inlineCapability, setInlineCapability] = useState('');
  const valid = typeof latitude === 'number' && typeof longitude === 'number'
    && isWithinCordovaMapBounds(latitude, longitude);
  const pinReviewEnabled = valid && reviewIncident?.incidentId === operationalIncidentId
    && reviewIncident?.reportReview?.departmentReviewEnabled && reviewIncident.reportReview.canReview && !reviewIncident.reportReview.readOnly;
  // One detector serves either view, even when the inline card leaves the viewport.
  const detection = useNearbyDetection(operationalIncidentId ? { kind: 'department', incidentId: operationalIncidentId } : null,
    valid && (inViewport || mapOpen));
  const displayedLatitude = detection.result?.center?.latitude ?? latitude;
  const displayedLongitude = detection.result?.center?.longitude ?? longitude;
  // Only the server's pending follow-ups belong to this original's intake.
  // Missing intake metadata must not turn every nearby peer into a review action.
  const reviewIncidentIds = detection.result?.reviewIncidentIds ?? (nearbyReviewUiEnabled ? [] : undefined);
  const reviewPins = detection.result?.items?.filter(pin => reviewIncidentIds === undefined
    || reviewIncidentIds.includes(pin.incidentId)) ?? [];
  // Presence of waiting metadata is the explicit-start backend capability.
  // A legacy deployment keeps the existing full review dialog as its fallback.
  const hasInlineCapability = detection.result?.waitingIncidentIds !== undefined;
  useEffect(() => { if (hasInlineCapability) setInlineCapability(detection.key); }, [hasInlineCapability, detection.key]);
  const inlineReview = nearbyReviewUiEnabled && (hasInlineCapability || inlineCapability === detection.key);
  const openNearbyReport = (incidentId: string) => {
    if (reviewPins.some(pin => pin.incidentId === incidentId)) setReviewId(incidentId);
  };

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
  }, [valid, pinReviewEnabled]);

  if (!valid) return <>
    <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Map unavailable: this report has no valid recorded coordinates.</p>
    {reviewIncident && onReviewChanged && <IncidentReviewActions incident={reviewIncident} onChanged={onReviewChanged} />}
  </>;

  const coordinates = `${displayedLatitude!.toFixed(6)}, ${displayedLongitude!.toFixed(6)}`;
  const compactHeight = mapOpen ? inlineReview ? 'min(70dvh, 600px)' : 'min(60dvh, 560px)' : 260;
  // Mount only one Leaflet map: changing views must not double tiles or readers.
  const mapContents = (reportPinReview?: ReportPinReviewControl) => <>
      {operationalIncidentId && <NearbyDetectionStatus detection={detection} />}
      {nearViewport || mapOpen
        ? <ExpandedMap expanded={Boolean(inlineReview && reviewId)} compactHeight={compactHeight} expandedHeight={mapOpen ? compactHeight : 480}>
          <LocationMap latitude={displayedLatitude!} longitude={displayedLongitude!} navigable height="100%"
            reportPinReview={reportPinReview}
            nearbyReferenceLabel={operationalIncidentId ? 'Report A' : undefined}
            nearbyPins={detection.result?.items} reviewIncidentIds={reviewIncidentIds} waitingIncidentIds={detection.result?.waitingIncidentIds} onNearbyReport={openNearbyReport}
            selectedNearbyReportId={inlineReview ? reviewId : undefined} onNearbyReportClose={() => setReviewId(null)}
            renderNearbyReport={inlineReview ? id => <NearbyReportPopupContent incidentId={id}
              distanceFromOriginalMeters={reviewPins.find(pin => pin.incidentId === id)?.distanceMeters} /> : undefined} />
        </ExpandedMap>
        : <LoadingPlaceholder label="Incident map loads when visible" layout="map" className="h-[260px]" />}
      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{operationalIncidentId ? '100 m nearby detection around the selected report' : '100 m around the reported pin · visual reference only'} · not the affected area or GPS accuracy. Cordova outline is approximate.</p>
      {reviewPins.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">Distances are from Report A (red pin) to each later report’s saved GPS pin. Straight-line estimates, rounded to the nearest metre; device GPS errors affect accuracy, not map zoom.</p>}
      {reviewPins.length ? <ul className="mt-2 space-y-1" aria-label="Authorized nearby reports">
        {reviewPins.map(pin => <li key={pin.incidentId}><button type="button" className="min-h-11 rounded-lg px-2 text-left text-sm font-semibold text-red-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-red-600" onClick={() => openNearbyReport(pin.incidentId)}>Review nearby report · {pin.services.join(' / ')} · {formatNearbyReportDistance(pin.distanceMeters) ?? 'Distance unavailable'} from Report A</button></li>)}
      </ul> : null}
  </>;

  const renderLocation = (reportPinReview?: ReportPinReviewControl) => (
    <div ref={container} className="mt-4 min-w-0" role="group" aria-label="Reported emergency location">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"><MapPin className="h-4 w-4 text-red-600" aria-hidden="true" />Incident location</span>
          <span className="mt-1 block text-xs tabular-nums text-slate-600 dark:text-slate-300">{coordinates}</span>
        </div>
        <button type="button" aria-haspopup="dialog" aria-expanded={mapOpen} onClick={() => setMapOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
          <Expand className="h-4 w-4" aria-hidden="true" />View map
        </button>
      </div>
      {reportPinReview && <p className="mb-2 text-sm text-slate-700">{reportPinReview.flagStatus === 'CONFIRMED' ? 'Department confirmation recorded — select the flagged pin to review.' : reportPinReview.flagStatus === 'PENDING' ? 'Flagged for department review — select the flagged pin to open the report. A flag is not a violation.' : 'Select the red report pin to review or flag this report.'}</p>}
      {!mapOpen && mapContents(reportPinReview)}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Incident map</DialogTitle>
            <DialogDescription>Zoom and drag to inspect the reported location. The recorded pin does not move.</DialogDescription>
          </DialogHeader>
          <p className="mb-3 text-xs tabular-nums text-slate-600 dark:text-slate-300">{coordinates}</p>
          {mapOpen && mapContents(reportPinReview)}
        </DialogContent>
      </Dialog>
      {operationalIncidentId && !inlineReview && <NearbyReportDialog incidentId={reviewId} onClose={() => setReviewId(null)} />}
    </div>
  );
  if (!reviewIncident || !onReviewChanged) return renderLocation();
  return pinReviewEnabled
    ? <IncidentReviewActions incident={reviewIncident} onChanged={onReviewChanged} renderTrigger={renderLocation} />
    : <>{renderLocation()}<IncidentReviewActions incident={reviewIncident} onChanged={onReviewChanged} /></>;
}
