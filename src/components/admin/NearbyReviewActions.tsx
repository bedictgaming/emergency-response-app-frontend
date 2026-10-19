'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEmergencyEvents } from '@/hooks/useEmergencyEvents';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { decideNearbyReview, getNearbyReviews, type NearbyReviewPage, type NearbyReview } from '@/lib/services/nearbyReviewService';

export function NearbyReviewActions({ incidentId, onChanged }: { incidentId: string; onChanged: () => void }) {
  const [data, setData] = useState<{ identity: string; value?: NearbyReviewPage; error?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const identity = `${adminAccountSnapshot()}:${typeof window === 'undefined' ? '' : localStorage.getItem('emergency-logout-epoch')}:${incidentId}`;
  const active = useRef('');
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEmergencyEvents(reload);
  useEffect(() => {
    const recover = () => { if (document.visibilityState === 'visible') reload(); };
    const timer = window.setInterval(recover, 30_000);
    window.addEventListener('focus', recover);
    return () => { clearInterval(timer); window.removeEventListener('focus', recover); };
  }, [reload]);
  useEffect(() => {
    active.current = identity;
    const controller = new AbortController();
    void getNearbyReviews({ incidentId }, controller.signal).then(value => {
      if (!controller.signal.aborted) setData({ identity, value });
    }).catch(() => { if (!controller.signal.aborted) setData({ identity, error: true }); });
    return () => { active.current = ''; controller.abort(); };
  }, [identity, incidentId, revision]);
  const current = data?.identity === identity ? data : null;
  const decide = async (review: NearbyReview, status: 'ACKNOWLEDGED' | 'REJECTED') => {
    if (busy || !current?.value?.canDecide || review.status !== 'PENDING') return;
    const reason = reasons[review.reviewId]?.trim();
    if (status === 'REJECTED' && (!reason || reason.length < 10)) { setError('Explain the rejection in 10–500 characters after reviewing the evidence.'); return; }
    setBusy(true); setError('');
    try {
      await decideNearbyReview(review, status, status === 'REJECTED' ? reason : undefined);
      if (active.current !== identity || `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}:${incidentId}` !== identity) return;
      setRevision(value => value + 1); onChanged();
    } catch { if (active.current === identity) { setError('Decision not confirmed or another admin already reviewed it. Reload the decision before retrying.'); setRevision(value => value + 1); } }
    finally { if (active.current === identity) setBusy(false); }
  };
  return <div className="mt-4 border-t border-border pt-4">
    <h3 className="font-semibold">Department intake decision</h3>
    <p className="mt-1 text-sm text-muted-foreground">Acknowledge admits this report; it does not resolve it. Rejection requires evidence and affects only your department. The record and photo remain retained.</p>
    {!current && <p role="status" className="mt-3 text-sm">Loading current review decisions…</p>}
    {current?.error && <p role="alert" className="mt-3 text-sm">Could not load decisions. <button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-11 underline underline-offset-4">Reload decisions</button></p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {current?.value?.items.map(review => <div key={review.reviewId} className="mt-4 space-y-3">
      <p className="text-sm font-semibold">{review.service} · {review.status === 'PENDING' ? 'Pending department review' : review.status === 'REJECTED' ? 'Rejected as fake by department' : 'Acknowledged'}</p>
      {review.reason && <p className="whitespace-pre-wrap break-words text-sm">Reason: {review.reason}</p>}
      {current.value!.canDecide && review.status === 'PENDING' ? <>
        <label className="block text-sm">Rejection reason — required only when rejecting
          <textarea maxLength={500} disabled={busy} value={reasons[review.reviewId] ?? ''} onChange={event => setReasons(value => ({ ...value, [review.reviewId]: event.target.value }))}
            className="mt-2 min-h-24 w-full rounded-lg border border-border bg-background p-3 focus-visible:outline-2 focus-visible:outline-ring" />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void decide(review, 'ACKNOWLEDGED')} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{busy ? 'Saving decision…' : 'Acknowledge and admit report'}</button>
          <button type="button" disabled={busy || (reasons[review.reviewId]?.trim().length ?? 0) < 10} onClick={() => void decide(review, 'REJECTED')} className="min-h-11 rounded-lg border border-destructive px-4 text-sm font-semibold text-destructive hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">Reject as fake — retain record</button>
        </div>
      </> : review.status === 'PENDING' ? <p className="text-sm text-muted-foreground">Only the assigned department administrator can decide. Main Admin monitoring is read-only.</p> : null}
    </div>)}
  </div>;
}
