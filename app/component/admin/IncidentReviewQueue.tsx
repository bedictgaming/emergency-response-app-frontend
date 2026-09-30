"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIncidentReviewQueue } from "@/lib/services/incidentService";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import IncidentPager from "./IncidentPager";
import IncidentReviewActions from "./IncidentReviewActions";

export default function IncidentReviewQueue({ revision, onChanged }: { revision: number; onChanged: () => Promise<void> }) {
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof getIncidentReviewQueue>> | null>(null);
  const [error, setError] = useState(false);
  const session = useRef({ account: adminAccountSnapshot(), logoutEpoch: typeof window === 'undefined' ? null : localStorage.getItem('emergency-logout-epoch') });
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const account = adminAccountSnapshot();
    if (!account || account !== session.current.account || localStorage.getItem('emergency-logout-epoch') !== session.current.logoutEpoch) return;
    const version = ++requestVersion.current;
    try {
      const result = await getIncidentReviewQueue(page);
      if (adminAccountSnapshot() !== account || version !== requestVersion.current || localStorage.getItem('emergency-logout-epoch') !== session.current.logoutEpoch) return;
      if (result.pagination.pages && page > result.pagination.pages) { setPage(result.pagination.pages); return; }
      setQueue(result); setError(false);
    } catch { if (adminAccountSnapshot() === account && version === requestVersion.current) setError(true); }
  }, [page]);
  useEffect(() => { if (revision > 0) void load(); }, [load, revision]);
  return <section aria-labelledby="report-review-queue" className="mb-8 rounded-xl border border-amber-200 bg-white p-5">
    <h2 id="report-review-queue" className="text-lg font-bold text-gray-900">Report review queue</h2>
    <p className="mt-1 text-sm text-gray-600">Review suspected false reports. Confirming a flag leaves the incident and its response status in place.</p>
    {error && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-800">The review queue could not be loaded.<button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border border-red-200 px-3 py-2 font-semibold">Retry review queue</button></div>}
    {!error && !queue && <p role="status" className="mt-4 text-sm text-gray-600">Loading review requests…</p>}
    {!error && queue?.flags.length === 0 && <p className="mt-4 text-sm text-gray-600">No pending or confirmed review flags.</p>}
    <div className="mt-4 space-y-4">{queue?.flags.map(flag => <div key={flag.reviewFlagId} className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-semibold text-amber-800">{flag.department} · {flag.status === "PENDING" ? "Awaiting review" : "Confirmed false report"}</p>
      <h3 className="mt-1 break-words font-semibold text-gray-900">{flag.incident.title}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{flag.reason}</p>
      <IncidentReviewActions incident={flag.incident} mainAdmin onChanged={onChanged} />
    </div>)}</div>
    {queue && <IncidentPager page={page} pages={queue.pagination.pages} total={queue.pagination.total} pageSize={queue.pagination.limit} onPageChange={setPage} hideWhenSinglePage />}
  </section>;
}
