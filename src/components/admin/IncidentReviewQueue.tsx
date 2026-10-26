"use client";

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getIncidentReviewQueue } from "@/lib/services/incidentService";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import IncidentPager from "./IncidentPager";
import IncidentReviewActions from "./IncidentReviewActions";
import { useEmergencyEvents } from '@/hooks/useEmergencyEvents';

type View = 'pending' | 'reviewed';
type Queue = Awaited<ReturnType<typeof getIncidentReviewQueue>>;
const views: View[] = ['pending', 'reviewed'];
const time = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' (Manila)'
  : 'Not recorded';

export default function IncidentReviewQueue({ revision = 1, onChanged, mainAdmin = true }: { revision?: number; onChanged: () => Promise<void>; mainAdmin?: boolean }) {
  const id = useId();
  const [{ view, page }, setSelection] = useState<{ view: View; page: number }>({ view: 'pending', page: 1 });
  const key = `${view}:${page}`;
  const [loaded, setLoaded] = useState<{ key: string; data: Queue; account: string; logout: string | null } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const session = useRef({ account: adminAccountSnapshot(), logoutEpoch: typeof window === 'undefined' ? null : localStorage.getItem('emergency-logout-epoch') });
  const requestVersion = useRef(0), pending = useRef<AbortController | null>(null), dialogOpen = useRef(false);
  const cancel = useCallback(() => { requestVersion.current++; pending.current?.abort(); }, []);
  const load = useCallback(async () => {
    const account = adminAccountSnapshot(), logout = localStorage.getItem('emergency-logout-epoch');
    if (!account || account !== session.current.account || logout !== session.current.logoutEpoch || dialogOpen.current) return;
    const generation = localStorage.getItem('emergency-session-generation');
    const version = ++requestVersion.current; pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const valid = () => !controller.signal.aborted && adminAccountSnapshot() === account && version === requestVersion.current
      && localStorage.getItem('emergency-logout-epoch') === logout && localStorage.getItem('emergency-session-generation') === generation;
    try {
      const result = await getIncidentReviewQueue(page, view, controller.signal);
      if (!valid() || dialogOpen.current) return;
      if (page > Math.max(1, result.pagination.pages)) { setSelection({ view, page: Math.max(1, result.pagination.pages) }); return; }
      setLoaded({ key, data: result, account, logout }); setErrorKey(null);
    } catch { if (valid()) setErrorKey(key); }
  }, [page, view, key]);
  useEffect(() => { if (revision > 0) void load(); return cancel; }, [load, revision, cancel]);
  useEffect(() => {
    const recover = () => { if (document.visibilityState === 'visible' && revision > 0) void load(); };
    const invalidate = (event: StorageEvent) => {
      if (!event.key || ['user', 'emergency-logout-epoch', 'emergency-session-generation'].includes(event.key)) {
        cancel(); dialogOpen.current = false; setLoaded(null); setErrorKey(null);
      }
    };
    const timer = window.setInterval(recover, 30_000);
    window.addEventListener('focus', recover); window.addEventListener('storage', invalidate);
    document.addEventListener('visibilitychange', recover);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', recover); window.removeEventListener('storage', invalidate); document.removeEventListener('visibilitychange', recover); };
  }, [load, revision, cancel]);
  useEmergencyEvents(load);
  const queue = loaded?.key === key && loaded.account === adminAccountSnapshot()
    && loaded.logout === localStorage.getItem('emergency-logout-epoch') ? loaded.data : null;
  const error = errorKey === key;
  const select = (next: View) => { if (next !== view) { cancel(); setSelection({ view: next, page: 1 }); } };
  if (!mainAdmin && queue && !queue.departmentReviewEnabled) return null;
  return <section aria-labelledby={`${id}-heading`} className="mb-8 min-w-0 rounded-xl border border-amber-200 bg-white p-4 text-gray-900 sm:p-5">
    <h2 id={`${id}-heading`} className="text-lg font-bold">Report review queue</h2>
    <p className="mt-1 max-w-prose text-sm leading-relaxed text-gray-600">{mainAdmin
      ? queue?.departmentReviewEnabled === false ? 'Legacy Main review mode. Review does not resolve response work; saved assessments remain available for correction.' : 'Monitoring only. Assigned departments review their flags and record the supporting evidence. Main Admin cannot confirm or dismiss them here.'
      : 'Your department reviews its own flags. A flag alone is not a violation; all assigned departments must confirm false for a whole-report sanction.'}</p>
    <div role="tablist" aria-label="Report review views" className="mt-5 flex flex-wrap gap-2" onKeyDown={event => {
      const next = event.key === 'Home' ? 'pending' : event.key === 'End' ? 'reviewed'
        : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? views[(views.indexOf(view) + 1) % views.length] : null;
      if (next) { event.preventDefault(); select(next); document.getElementById(`${id}-${next}`)?.focus(); }
    }}>
      {views.map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-panel`} aria-selected={view === value} tabIndex={view === value ? 0 : -1}
        onClick={() => select(value)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 ${view === value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
        {value === 'pending' ? 'Pending reviews' : 'Reviewed / Flag history'}
      </button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${view}`} aria-busy={!queue && !error} tabIndex={0} className="mt-4 min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
      <p className="max-w-prose text-sm leading-relaxed text-gray-600">{view === 'pending'
        ? 'Awaiting a decision · oldest pending flags first.'
        : 'Latest completed assessment per department/report · newest review first. Re-flagged reports return to Pending; earlier decisions remain in the audit log. This is separate from response status.'}</p>
      {error && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-800">This review list could not be refreshed.<button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border border-red-200 px-3 py-2 font-semibold">Retry review queue</button></div>}
      {!error && !queue && <LoadingPlaceholder label={view === 'pending' ? 'Loading pending reviews…' : 'Loading flag history…'} />}
      {queue && <>
        <p role="status" className="mt-4 text-sm text-gray-600">{queue.pagination.total} {view === 'pending' ? 'pending flags' : 'completed assessments'} · {queue.pagination.limit} records per page</p>
        {queue.flags.length === 0 && <p className="py-6 text-sm text-gray-600">{view === 'pending' ? 'No pending review flags.' : 'No completed reviews in this history.'}</p>}
        <ol className="mt-3 divide-y divide-gray-200">{queue.flags.map(flag => <li key={flag.reviewFlagId} className="min-w-0 py-5 first:pt-2">
          <p className="text-sm font-semibold text-amber-900">{flag.department} · {flag.status === 'PENDING' ? 'Awaiting review' : flag.status === 'DISMISSED' ? 'Suspicion dismissed' : flag.department === 'MAIN' ? 'Main confirmation recorded' : 'Department confirmed false'}</p>
          <h3 className="mt-1 break-words text-base font-semibold [overflow-wrap:anywhere]">{flag.incident.title}</h3>
          <p className="mt-1 text-sm text-gray-600">Report status: {flag.incident.status}{flag.incident.status === 'CANCELLED' ? ' · record retained' : ''}</p>
          <dl className="mt-4 max-w-prose space-y-3">
            <div><dt className="text-sm font-semibold">Flag reason</dt><dd className="mt-1 whitespace-pre-wrap break-words text-base leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{flag.reason}</dd></div>
            {view === 'reviewed' && <>
              <div><dt className="text-sm font-semibold">Review notes</dt><dd className="mt-1 whitespace-pre-wrap break-words text-base leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{flag.reviewNotes || 'Not recorded'}</dd></div>
              <div><dt className="text-sm font-semibold">Reviewed</dt><dd className="mt-1 text-sm text-gray-600">{time(flag.reviewedAt)}</dd></div>
              <div><dt className="text-sm font-semibold">Recorded reviewer (current profile)</dt><dd className="mt-1 break-words text-sm text-gray-600 [overflow-wrap:anywhere]">{flag.reviewer?.name || 'Reviewer unavailable in the retained record'}</dd></div>
            </>}
          </dl>
          <IncidentReviewActions incident={flag.incident} mainAdmin={mainAdmin} onDialogOpenChange={open => { dialogOpen.current = open; if (!open) void load(); }}
            onChanged={async () => { await load(); await onChanged(); }}
            renderTrigger={({ onOpen, busy }) => <button type="button" disabled={busy} onClick={onOpen} className="mt-4 min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50">
              {view === 'pending' ? mainAdmin && queue.departmentReviewEnabled !== false ? 'Monitor report review' : 'Review report' : !mainAdmin && flag.status === 'CONFIRMED' ? 'View review / correction' : 'View reviewed report'}
            </button>} />
        </li>)}</ol>
        <IncidentPager page={page} pages={queue.pagination.pages} total={queue.pagination.total} pageSize={queue.pagination.limit} onPageChange={value => { cancel(); setSelection({ view, page: value }); }} hideWhenSinglePage />
      </>}
    </div>
  </section>;
}
