'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useEmergencyEvents } from '@/hooks/useEmergencyEvents';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { decideNearbyReview, flagNearbyReview, getNearbyReviews, startNearbyResponse, type NearbyReviewPage, type NearbyReview } from '@/lib/services/nearbyReviewService';

export function NearbyReviewActions({ incidentId, onChanged, compact = false, flaggedForReview = false }: { incidentId: string; onChanged: () => void; compact?: boolean; flaggedForReview?: boolean }) {
  const formId = useId();
  const [flagForm, setFlagForm] = useState<string | null>(null);
  const [flagSaved, setFlagSaved] = useState(false);
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
  const decide = async (review: NearbyReview, status: 'ACKNOWLEDGED' | 'REJECTED' | 'START' | 'FLAG') => {
    if (busy || !current?.value?.canDecide || `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}:${incidentId}` !== identity) return;
    if (status === 'FLAG' ? !current.value.requiresResponseStart || !['PENDING', 'ACKNOWLEDGED'].includes(review.status) || review.responseStarted
      : status === 'START' ? !current.value.requiresResponseStart || review.status !== 'ACKNOWLEDGED' || review.responseStarted
      : review.status !== 'PENDING') return;
    const reason = reasons[review.reviewId]?.trim();
    if ((status === 'REJECTED' || status === 'FLAG') && (!reason || reason.length < 10 || reason.length > 500)) { setError('Explain the supporting facts in 10–500 characters after reviewing the evidence.'); return; }
    setBusy(true); setError('');
    try {
      if (status === 'FLAG') await flagNearbyReview(review, reason!);
      else if (status === 'START') await startNearbyResponse(review);
      else await decideNearbyReview(review, status, status === 'REJECTED' ? reason : undefined);
      if (active.current !== identity || `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}:${incidentId}` !== identity) return;
      if (status === 'FLAG') { setFlagForm(null); setFlagSaved(true); }
      setRevision(value => value + 1); onChanged();
    } catch { if (active.current === identity) { setError('Decision not confirmed or another admin already reviewed it. Reload the decision before retrying.'); setRevision(value => value + 1); } }
    finally { if (active.current === identity) setBusy(false); }
  };
  return <div className={compact ? 'mt-3 border-t border-border pt-2' : 'mt-4 border-t border-border pt-4'}>
    {!compact && <h3 className="font-semibold">Department intake decision</h3>}
    {!compact && <p className="mt-1 text-sm text-muted-foreground">{current?.value?.requiresResponseStart
      ? 'Acknowledge records your review only. The report stays out of Responding until you choose Start response. Rejection requires evidence; the record and photo are retained.'
      : 'Acknowledge admits this report; it does not resolve it. Rejection requires evidence and affects only your department. The record and photo remain retained.'}</p>}
    {!current && <p role="status" className="mt-3 text-sm">Loading current review decisions…</p>}
    {current?.error && <p role="alert" className="mt-3 text-sm">Could not load decisions. <button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-11 underline underline-offset-4">Reload decisions</button></p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {flagSaved && <p role="status" className="mt-3 text-sm">Flag saved for Main Admin review. Response status unchanged.</p>}
    {current?.value?.items.map(review => <div key={review.reviewId} className={compact ? 'mt-2 space-y-2' : 'mt-4 space-y-3'}>
      <p className="text-sm font-semibold">{review.service} · {review.status === 'PENDING' ? compact ? 'Pending review' : 'Pending department review' : review.status === 'REJECTED' ? 'Rejected as fake by department'
        : current.value?.requiresResponseStart ? review.responseStarted ? 'Response started' : 'Acknowledged — waiting to respond' : 'Acknowledged'}</p>
      {review.reason && <p className="whitespace-pre-wrap break-words text-sm">Reason: {review.reason}</p>}
      {current.value!.canDecide && review.status === 'PENDING' ? <>
        {!compact && <label className="block text-sm">Rejection reason — required only when rejecting
          <textarea maxLength={500} disabled={busy} value={reasons[review.reviewId] ?? ''} onChange={event => setReasons(value => ({ ...value, [review.reviewId]: event.target.value }))}
            className="mt-2 min-h-24 w-full rounded-lg border border-border bg-background p-3 focus-visible:outline-2 focus-visible:outline-ring" />
        </label>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} aria-label={compact ? 'Acknowledge report' : undefined} onClick={() => void decide(review, 'ACKNOWLEDGED')} className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{busy ? 'Saving…' : compact ? 'Acknowledge' : current.value?.requiresResponseStart ? 'Acknowledge report' : 'Acknowledge and admit report'}</button>
          {compact && current.value!.requiresResponseStart && !flaggedForReview && !flagSaved && flagForm !== review.reviewId && <button type="button" aria-label="Flag suspected false report" disabled={busy} onClick={() => setFlagForm(review.reviewId)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">Flag</button>}
          {!compact && <button type="button" disabled={busy || (reasons[review.reviewId]?.trim().length ?? 0) < 10} onClick={() => void decide(review, 'REJECTED')} className="min-h-11 rounded-lg border border-destructive px-4 text-sm font-semibold text-destructive hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">Reject as fake — retain record</button>}
        </div>
      </> : current.value!.canDecide && current.value!.requiresResponseStart && review.status === 'ACKNOWLEDGED' && !review.responseStarted ? <>
        <p role="status" className="text-sm text-muted-foreground">Review acknowledged. This report is still waiting and is not in Responding.</p>
        <button type="button" disabled={busy} onClick={() => void decide(review, 'START')} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{busy ? 'Saving decision…' : 'Start response'}</button>
      </> : review.status === 'PENDING' || (current.value!.requiresResponseStart && review.status === 'ACKNOWLEDGED' && !review.responseStarted)
        ? <p className="text-sm text-muted-foreground">Only the assigned department administrator can decide. Main Admin monitoring is read-only.</p> : null}
      {compact && current.value!.canDecide && current.value!.requiresResponseStart && ['PENDING', 'ACKNOWLEDGED'].includes(review.status) && !review.responseStarted && <>
        {flaggedForReview || flagSaved ? <p className="text-sm text-muted-foreground">This report already has a review flag. Flagging does not admit or reject it.</p>
          : flagForm === review.reviewId ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void decide(review, 'FLAG'); }}>
            <label htmlFor={`${formId}-${review.reviewId}`} className="block text-sm font-semibold">Why do you suspect this report is false?</label>
            <textarea id={`${formId}-${review.reviewId}`} value={reasons[review.reviewId] ?? ''} onChange={event => setReasons(value => ({ ...value, [review.reviewId]: event.target.value }))} required minLength={10} maxLength={500} rows={3} disabled={busy} className="w-full rounded-lg border border-border bg-background p-2 text-base focus-visible:outline-2 focus-visible:outline-ring" />
            <p className="text-sm text-muted-foreground">Use 10–500 characters. This requests Main Admin review; it does not confirm a fake report.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => setFlagForm(null)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Cancel flag</button>
              <button type="submit" disabled={busy || (reasons[review.reviewId]?.trim().length ?? 0) < 10} className="min-h-11 rounded-lg border border-destructive px-3 text-sm font-semibold text-destructive focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{busy ? 'Saving flag…' : 'Send review request'}</button>
            </div>
          </form> : review.status !== 'PENDING' ? <button type="button" disabled={busy} onClick={() => setFlagForm(review.reviewId)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">Flag suspected false report</button> : null}
      </>}
    </div>)}
  </div>;
}
