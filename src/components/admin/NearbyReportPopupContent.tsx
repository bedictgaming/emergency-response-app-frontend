'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { formatIncidentForDashboard, getIncidentById, type Incident } from '@/lib/services/incidentService';
import { useEmergencyEvents } from '@/hooks/useEmergencyEvents';
import { LoadingPlaceholder } from '@/components/ui/loading-placeholder';
import { CompactEvidencePhoto } from '@/components/shared/SecureEvidencePhoto';
import { NearbyReviewActions } from './NearbyReviewActions';

const nearbyIdentity = () => `${adminAccountSnapshot()}:${typeof window === 'undefined' ? '' : localStorage.getItem('emergency-logout-epoch')}`;

// Mounted only for a selected, server-authorized follow-up. Never put private
// report text in a static marker, event payload or an unauthenticated map URL.
export function NearbyReportPopupContent({ incidentId }: { incidentId: string }) {
  const identity = nearbyIdentity();
  const [data, setData] = useState<{ identity: string; id: string; report?: Incident; error?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEmergencyEvents(refresh);
  useEffect(() => {
    const recover = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', recover);
    const timer = setInterval(recover, 30_000);
    return () => { window.removeEventListener('focus', recover); clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    void getIncidentById(incidentId, controller.signal).then(report => {
      if (!controller.signal.aborted && nearbyIdentity() === identity) setData({ identity, id: incidentId, report });
    }).catch(() => { if (!controller.signal.aborted && nearbyIdentity() === identity) setData({ identity, id: incidentId, error: true }); });
    return () => controller.abort();
  }, [identity, incidentId, revision]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [incidentId]);
  const current = data?.identity === identity && data.id === incidentId ? data : null;
  // Reuse the submitted-report contact parser. Do not replace a missing report
  // contact with the account/profile phone or expose it before authorized read.
  const details = current?.report ? formatIncidentForDashboard(current.report) : null;
  return <section aria-label="Nearby submitted report" className="min-w-0 break-words text-foreground">
    <h3 ref={heading} tabIndex={-1} className="pr-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-ring">{current?.report?.title || 'Nearby submitted report'}</h3>
    {current?.error ? <div role="alert" className="mt-3 text-sm">Report unavailable or outside your current access. <button type="button" onClick={refresh} className="min-h-11 font-semibold underline underline-offset-4">Retry report</button></div>
      : current?.report ? <>
        <p className="mt-2 text-sm text-muted-foreground">Status: {current.report.status} · {current.report.requestedServices?.join(' / ')}</p>
        <p className="mt-2 text-sm"><span className="font-semibold">Contact number: </span><span>{details?.phone || 'Not provided'}</span></p>
        <p className="mt-3 whitespace-pre-wrap text-sm">{details?.description || current.report.title}</p>
        <p className="mt-3 text-sm">Location: {current.report.location?.address || current.report.location?.locationName || 'Recorded report pin'}</p>
        {current.report.attachments?.[0]?.fileUrl && <div className="mt-3"><CompactEvidencePhoto sourceUrl={current.report.attachments[0].fileUrl} alt="Nearby report evidence" /></div>}
        {current.report.nearbyIntake?.length ? <NearbyReviewActions key={`${identity}:${incidentId}`} incidentId={incidentId} compact
          flaggedForReview={current.report.reviewFlags?.some(flag => flag.status !== 'DISMISSED')} onChanged={refresh} /> : null}
      </> : <LoadingPlaceholder label="Loading authorized report…" rows={2} />}
  </section>;
}
