'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getNearbyReviews, nearbyReviewUiEnabled, type NearbyReviewPage, type NearbyReviewStatus } from '@/lib/services/nearbyReviewService';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { useEmergencyEvents } from '@/hooks/useEmergencyEvents';
import { NearbyReportDialog } from './NearbyReportDialog';

export function NearbyReviewQueue({ onChanged }: { onChanged: () => Promise<void> }) {
  return nearbyReviewUiEnabled ? <Queue onChanged={onChanged} /> : null;
}
function Queue({ onChanged }: { onChanged: () => Promise<void> }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<NearbyReviewStatus>('PENDING');
  const [selected, setSelected] = useState<{ incidentId: string; identity: string } | null>(null);
  const [result, setResult] = useState<{ identity: string; page: number; status: NearbyReviewStatus; value?: NearbyReviewPage; error?: boolean } | null>(null);
  const identity = `${adminAccountSnapshot()}:${typeof window === 'undefined' ? '' : localStorage.getItem('emergency-logout-epoch')}`;
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const value = await getNearbyReviews({ page, status }, controller.signal);
      const current = `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}`;
      if (!controller.signal.aborted && current === identity) setResult({ identity, page, status, value });
    } catch { if (!controller.signal.aborted && `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}` === identity)
      setResult({ identity, page, status, error: true }); }
  }, [identity, page, status]);
  useEmergencyEvents(load);
  useEffect(() => {
    void load();
    const recover = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(recover, 30_000);
    window.addEventListener('focus', recover);
    return () => { request.current?.abort(); clearInterval(timer); window.removeEventListener('focus', recover); };
  }, [load]);
  const current = result?.identity === identity && result.page === page && result.status === status ? result : null;
  if (current?.value?.enabled === false) return null;
  return <section aria-label="Nearby report intake" className="mb-6 rounded-xl border border-border bg-card p-5 text-foreground">
    <h2 className="text-lg font-bold">Nearby reports awaiting department review</h2>
    <p className="mt-1 max-w-prose text-sm text-muted-foreground">Later similar submissions within 100 m are retained here before entering the regular queue. Nearby does not mean fake. Review the evidence before deciding.</p>
    <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">Review status
      <select value={status} onChange={event => { setStatus(event.target.value as NearbyReviewStatus); setPage(1); }} className="min-h-11 rounded-lg border border-border bg-card px-3 focus-visible:outline-2 focus-visible:outline-ring">
        <option value="PENDING">Pending department review</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="REJECTED">Rejected — retained records</option>
      </select>
    </label>
    {!current && <p role="status" className="mt-4 text-sm">Loading nearby report reviews…</p>}
    {current?.error && <p role="alert" className="mt-4 text-sm">Review queue unavailable. Reports remain retained. <button type="button" onClick={() => void load()} className="min-h-11 underline underline-offset-4">Retry review queue</button></p>}
    {current?.value?.items.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No {status.toLowerCase()} nearby reviews on this page.</p>}
    <ul className="mt-4 divide-y divide-border">{current?.value?.items.map(item => <li key={item.reviewId} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0"><h3 className="break-words font-semibold">{item.incident.title}</h3><p className="text-sm text-muted-foreground">{item.service} · {item.status === 'PENDING' ? 'Pending department review' : item.status === 'REJECTED' ? 'Rejected by department' : 'Acknowledged'}</p></div>
      <button type="button" onClick={() => setSelected({ incidentId: item.incidentId, identity })} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Review nearby report</button>
    </li>)}</ul>
    {(page > 1 || current?.value?.hasMore) && <nav aria-label="Nearby review pages" className="mt-4 flex items-center gap-4 text-sm">
      <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50">Previous</button>
      <span>Page {page}</span><button type="button" disabled={!current?.value?.hasMore} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50">Next</button>
    </nav>}
    <NearbyReportDialog incidentId={selected?.identity === identity ? selected.incidentId : null} onClose={() => { setSelected(null); void load(); void onChanged(); }} />
  </section>;
}
