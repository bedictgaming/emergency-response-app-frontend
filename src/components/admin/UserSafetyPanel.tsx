'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getUserSafety, requestUserPasswordReset, type SystemUser, type UserSafetyRecord } from '@/lib/services/userService';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';

function auditTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date) : 'Date unavailable';
}
function auditActor(actor?: { id: string; name: string | null } | null) {
  return actor ? `${actor.name || 'Name unavailable'} · ID ${actor.id}` : 'Actor not available in the retained record';
}
function reviewLabel(event: NonNullable<UserSafetyRecord['reviewEvents']>[number]) {
  switch (event.action) {
    case 'INCIDENT_FLAGGED': return 'Report flagged for review';
    case 'INCIDENT_FLAG_REVIEWED': return event.decision === 'CONFIRMED' ? 'False report confirmed' : event.decision === 'DISMISSED' ? 'Flag dismissed' : 'Flag reviewed';
    case 'INCIDENT_FLAG_CORRECTED': return 'False-report confirmation corrected';
    case 'NEARBY_REPORT_REJECTED': return 'Nearby report rejected';
    case 'NEARBY_REPORT_ACKNOWLEDGED': return 'Nearby report acknowledged';
    default: return 'Report review action';
  }
}

export function UserSafetyPanel({ user, onClose }: { user: SystemUser; onClose: () => void }) {
  const [record, setRecord] = useState<UserSafetyRecord | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const current = ++revision.current, account = adminAccountSnapshot();
    const logout = localStorage.getItem('emergency-logout-epoch');
    const valid = () => current === revision.current && account === adminAccountSnapshot()
      && logout === localStorage.getItem('emergency-logout-epoch');
    try { const data = await getUserSafety(user.id); if (valid()) { setRecord(data); setError(''); } }
    catch { if (valid()) { setRecord(null); setError('Account safety could not load. Retry when your connection is available.'); } }
  }, [user.id]);
  useEffect(() => { const requests = revision; void load(); return () => { requests.current++; }; }, [load]);
  useEffect(() => {
    const account = adminAccountSnapshot(), logout = localStorage.getItem('emergency-logout-epoch');
    const changed = () => {
      if (account === adminAccountSnapshot() && logout === localStorage.getItem('emergency-logout-epoch')) return;
      revision.current++; setRecord(null); setMessage('');
      setError('Account changed. Close this panel and reload from your authorized dashboard.');
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [user.id]);
  useLiveRefresh(load, true, true);
  async function resetPassword() {
    const account = adminAccountSnapshot(), logout = localStorage.getItem('emergency-logout-epoch');
    const current = () => account === adminAccountSnapshot() && logout === localStorage.getItem('emergency-logout-epoch');
    setSending(true); setMessage('');
    try {
      const result = await requestUserPasswordReset(user.id);
      if (current()) setMessage(result);
    } catch { if (current()) setMessage('Reset delivery was not confirmed. No password was changed. Check the account status or wait a minute before retrying.'); }
    finally { if (current()) setSending(false); }
  }
  return <section aria-label={`Account safety for ${user.name || user.email}`} className="max-w-[75ch] space-y-5 rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Account safety</h2>
      <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-purple-700">Close account safety</button>
    </div>
    {error ? <p role="alert">{error} <button type="button" onClick={() => void load()} className="min-h-11 px-2 underline">Retry</button></p>
      : !record ? <p role="status">Loading account safety…</p> : <>
      <div>
        <p className="font-semibold tabular-nums">{record.confirmedFalseCount} / {record.threshold} distinct confirmed-false reports in the current cycle</p>
        <p className="mt-2 leading-6">{record.enabled ? 'The third confirmed-false report deactivates citizen access. Only Main Admin can reactivate it.' : 'Automatic confirmed-false sanctions are not enabled on this server.'} Pending flags and nearby detection are not proof of a false report. The separate 3 reports / 5 minutes rule is unchanged.</p>
        <p className="mt-2 leading-6">Correcting a mistaken confirmation updates the count but never automatically restores access. Main Admin reactivation starts a fresh cycle; previously counted reports are not counted again.</p>
        <p className="mt-2 leading-6">Sanctions follow this citizen account across devices. This is not an IMEI/device ban and does not identify the same person behind a different account.</p>
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-2 focus-visible:outline-purple-700">Recent sanction decisions (up to 20)</summary>
        {record.events.length ? <ol className="space-y-3 py-2">
          {record.events.map((event, index) => <li key={event.auditLogId || `${event.createdAt}-${index}`} className="break-words leading-6 [overflow-wrap:anywhere]">
            <time dateTime={event.createdAt}>{auditTime(event.createdAt)} (Asia/Manila)</time> · {event.action === 'CITIZEN_FALSE_REPORT_RESET' ? 'Main Admin reactivation — new cycle'
              : event.action === 'CITIZEN_AUTO_DEACTIVATED' ? `Automatic deactivation · ${event.metadata?.reasonCode === 'THREE_CONFIRMED_FALSE_REPORTS' ? '3 confirmed-false reports' : 'submission-volume rule'}`
                : `${event.metadata?.confirmed ? 'Confirmed false' : 'Confirmation corrected'} · report ${event.metadata?.incidentId ?? 'unavailable'}`}
            <p className="mt-1">Recorded actor: {auditActor(event.actor)}</p>
          </li>)}
        </ol> : <p className="py-2">No recorded sanction decisions. Historical reports are not backfilled.</p>}
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-2 focus-visible:outline-purple-700">Recent report review actions (up to 20)</summary>
        <p className="mb-3 leading-6">Main Admin only. Latest 20 review actions for the 20 most recent recorded submissions. Flagging alone is not a violation; nearby rejection counts only under the existing all-service decision rule. Actor IDs are retained references; displayed names use current profiles.</p>
        {record.reviewEvents?.length ? <ol aria-label="Report review audit log" className="space-y-4 py-2">
          {record.reviewEvents.map(event => <li key={event.auditLogId} className="break-words leading-6 [overflow-wrap:anywhere]">
            <p className="font-semibold">{reviewLabel(event)}{event.department ? ` · ${event.department}` : ''}</p>
            <time dateTime={event.createdAt}>{auditTime(event.createdAt)} (Asia/Manila)</time>
            <p>Report: {event.incidentId ?? 'Unavailable'}</p>
            <p>Recorded actor: {auditActor(event.actor)}</p>
            <p className="whitespace-pre-wrap">Reason / review notes: {event.reason || 'Not recorded'}</p>
          </li>)}
        </ol> : <p className="py-2">No report review actions available for these recent submissions. This does not mean the account has no historical violations.</p>}
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-2 focus-visible:outline-purple-700">Recent report request context (up to 20)</summary>
        <p className="mb-3 leading-6">Main Admin only. A shared IP or browser string does not prove who submitted a report. Browser strings can be changed. The website cannot read a phone&apos;s IMEI.</p>
        {record.recentReports.length ? <ul className="space-y-4">
          {record.recentReports.map((report, index) => <li key={`${report.incidentId}-${index}`} className="break-words leading-6 [overflow-wrap:anywhere]">
            <p className="font-medium">Report {report.incidentId ?? 'unavailable'}</p>
            <p>Request IP: {report.ipAddress ?? 'Not recorded'} · {new Date(report.createdAt).toLocaleString('en-PH')}</p>
            <p>Browser-supplied user agent: {report.userAgent ?? 'Not recorded'}</p>
          </li>)}
        </ul> : <p>No recorded report context.</p>}
      </details>
    </>}
    <div className="space-y-3 border-t border-slate-300 pt-5">
      <h3 className="font-semibold">Password recovery</h3>
      <p className="leading-6">Send a one-time, 30-minute reset link to this account&apos;s saved email. No shared default password; the owner chooses their password. This does not reactivate an inactive account.</p>
      <button type="button" disabled={sending || user.status !== 'ACTIVE' || !user.email} onClick={() => void resetPassword()}
        className="min-h-11 rounded-lg border border-purple-700 px-4 font-semibold text-purple-800 hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-700 disabled:cursor-not-allowed disabled:opacity-60">
        {sending ? 'Requesting reset email…' : 'Send password reset email'}
      </button>
      {user.status !== 'ACTIVE' && <p>Reactivate only after reviewing the account; reset email is unavailable while inactive.</p>}
      {message && <p role="status" className="leading-6">{message}</p>}
    </div>
  </section>;
}
