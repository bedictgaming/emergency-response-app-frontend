"use client";

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { useId, useState } from "react";
import { Flag, ShieldCheck, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CompactEvidencePhoto } from "../SecureEvidencePhoto";
import IncidentReviewNotice, { mergeReviewNotices } from './IncidentReviewNotice';
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { cancelFalseIncident, correctIncidentFlag, deleteIncident, flagIncident, getIncidentById, Incident, IncidentReviewFlag, reviewIncidentFlag, updateIncident, type FalseReportVersion } from "@/lib/services/incidentService";

type ReportSummary = Pick<Incident, "incidentId" | "title" | "status"> & Partial<Incident>;
const buttonClass = "min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass = "mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:outline-2 focus:outline-offset-2 focus:outline-red-600";
const errorMessage = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message || "The action could not be completed. Refresh the report and try again.";

function FlagDecision({ flag, busy, cancelled, onReview, onCorrect }: { flag: IncidentReviewFlag; busy: boolean; cancelled: boolean; onReview: (flag: IncidentReviewFlag, decision: "CONFIRMED" | "DISMISSED", notes: string) => void; onCorrect: (flag: IncidentReviewFlag, notes: string) => void }) {
  const inputId = useId();
  const [notes, setNotes] = useState("");
  const [correcting, setCorrecting] = useState(false);
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
    <p className="text-sm font-semibold text-gray-900">{flag.department} · {flag.status === "PENDING" ? "Awaiting review" : flag.status === 'CONFIRMED' ? "Confirmed false report" : 'Suspicion dismissed'}</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{flag.reason}</p>
    {flag.status === "PENDING" ? <>
      <label htmlFor={inputId} className="mt-4 block text-sm font-medium text-gray-900">Review explanation (required)</label>
      <textarea id={inputId} value={notes} onChange={event => setNotes(event.target.value)} maxLength={500} rows={3} disabled={busy} className={fieldClass} />
      <p className="mt-2 text-sm text-gray-700">Record what was checked, such as contact with the reporter or an on-site check. A wrong category, an unclear photo or an uncertain GPS estimate alone does not prove a false report.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || notes.trim().length < 10} onClick={() => onReview(flag, "DISMISSED", notes)} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>Dismiss suspicion</button>
        <button type="button" disabled={busy || notes.trim().length < 10} onClick={() => onReview(flag, "CONFIRMED", notes)} className={`${buttonClass} border-amber-300 bg-amber-100 text-amber-900`}>Confirm false report</button>
      </div>
    </> : <>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">Review: {flag.reviewNotes}</p>
      {flag.status === 'CONFIRMED' && (correcting ? <form className="mt-4" onSubmit={event => { event.preventDefault(); if (!busy && notes.trim().length >= 10) onCorrect(flag, notes); }}>
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900">Why was the false-report decision incorrect?</label>
        <textarea id={inputId} required minLength={10} maxLength={500} rows={3} value={notes} onChange={event => setNotes(event.target.value)} disabled={busy} className={fieldClass} aria-describedby={`${inputId}-correction-help`} />
        <p id={`${inputId}-correction-help`} className="mt-2 text-sm text-gray-700">This dismisses this flag. The original decision and your correction remain in the audit log. Response status, dispatches and evidence stay unchanged. {cancelled ? 'The report remains cancelled, is not reopened and stays excluded from verified analytics.' : 'Analytics include the report again only when no other confirmed-false flag remains.'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => { setCorrecting(false); setNotes(''); }} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>Cancel correction</button>
          <button type="submit" disabled={busy || notes.trim().length < 10} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>{busy ? 'Saving…' : 'Save correction and dismiss flag'}</button>
        </div>
      </form> : <button type="button" disabled={busy} onClick={() => { setNotes(''); setCorrecting(true); }} className={`${buttonClass} mt-3 border-gray-300 bg-white text-gray-800`}>Correct mistaken confirmation</button>)}
    </>}
  </div>;
}

export default function IncidentReviewActions({ incident, mainAdmin = false, onChanged }: { incident: ReportSummary; mainAdmin?: boolean; onChanged: () => Promise<void> }) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [cancelMode, setCancelMode] = useState(false);
  const [falseTarget, setFalseTarget] = useState<FalseReportVersion | undefined>();
  const activeFlag = incident.reviewFlags?.find(flag => flag.status !== "DISMISSED");

  const openReport = async () => {
    if (busy) return;
    const account = adminAccountSnapshot();
    setOpen(true); setBusy(true); setError(null); setNotice(null); setCurrent(null); setDeleteMode(false); setCancelMode(false); setFalseTarget(undefined); setConfirmation(""); setReason("");
    try {
      const report = await getIncidentById(incident.incidentId);
      if (adminAccountSnapshot() === account) setCurrent(report);
    } catch (caught) {
      if (adminAccountSnapshot() === account) setError(errorMessage(caught));
    } finally { setBusy(false); }
  };

  const act = async (operation: () => Promise<unknown>, success: string, deleted = false) => {
    if (busy || !current) return;
    const account = adminAccountSnapshot();
    setBusy(true); setError(null); setNotice(null);
    let saved = false;
    try {
      await operation();
      saved = true;
      if (adminAccountSnapshot() !== account) return;
      // A failed refresh must not make a committed deletion appear failed.
      if (deleted) { setOpen(false); setCurrent(null); }
      else {
        setCancelMode(false); setDeleteMode(false); setFalseTarget(undefined);
        setNotice(success);
        const refreshed = await getIncidentById(incident.incidentId);
        if (adminAccountSnapshot() === account) setCurrent(refreshed);
      }
      if (adminAccountSnapshot() === account) await onChanged();
    } catch (caught) {
      if (adminAccountSnapshot() === account) setError(saved ? "The action was saved, but the latest report could not be loaded. Close this dialog and refresh the dashboard." : errorMessage(caught));
    } finally { setBusy(false); }
  };

  const flags = current?.reviewFlags ?? [];
  const confirmedFlag = flags.find(flag => flag.status === 'CONFIRMED');
  const cancelled = current?.status === 'CANCELLED';
  const dispositionMode = deleteMode || cancelMode;
  const beginDisposition = (mode: 'cancel' | 'delete', flag?: IncidentReviewFlag) => {
    if (!current || busy) return;
    setFalseTarget(flag ? { reviewFlagId: flag.reviewFlagId, expectedReviewUpdatedAt: flag.updatedAt, expectedIncidentUpdatedAt: current.updatedAt } : undefined);
    setCancelMode(mode === 'cancel'); setDeleteMode(mode === 'delete'); setReason(''); setConfirmation(''); setNotice(null); setError(null);
  };
  const sharedNotices = mergeReviewNotices(current?.reviewNotices, incident.reviewNotices);
  // A fresher shared decision may retire an already authorized own-department
  // request while this dialog is open. Never turn a foreign notice into an
  // actionable flag; the server still authorizes every submitted request.
  const ownFlag = flags.map(flag => {
    const latest = sharedNotices?.find(item => item.reviewFlagId === flag.reviewFlagId);
    return latest && Date.parse(latest.updatedAt) > Date.parse(flag.updatedAt)
      ? { ...flag, status: latest.status } : flag;
  }).find(flag => flag.status !== "DISMISSED");
  return <div className="mt-4 border-t border-gray-200 pt-3">
    {!mainAdmin && <IncidentReviewNotice notices={incident.reviewNotices} cancelled={incident.status === 'CANCELLED'} />}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void openReport()} disabled={busy} className={`${buttonClass} inline-flex items-center gap-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
        {mainAdmin ? <ShieldCheck size={16} aria-hidden="true" /> : <Flag size={16} aria-hidden="true" />}
        {mainAdmin ? "Review / manage report" : incident.status === 'CANCELLED' ? 'View cancelled report' : "Flag suspected false report"}
      </button>
      {activeFlag && <span className="text-xs font-medium text-amber-800">{activeFlag.status === "CONFIRMED" ? "Main admin confirmed a false report" : "Flagged for main-admin review"}</span>}
    </div>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-xl bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle>{deleteMode ? "Permanently delete this report?" : cancelMode ? 'Cancel this confirmed false report?' : mainAdmin ? "Review and manage report" : cancelled ? 'View cancelled report' : "Flag a suspected false report"}</DialogTitle>
          <DialogDescription>{deleteMode ? "This removes the report, its attachments and linked operational records. The audit history remains. This action cannot be undone in the app." : cancelMode ? 'Cancellation ends response work and alerts, but keeps this report, its evidence and audit history. Department Resolve is not required.' : "Flagging requests main-admin review. Review does not resolve the report; assigned departments remain responsible for their responses. Main Admin can cancel or delete a confirmed false report after units return and tasks are finished."}</DialogDescription>
        </DialogHeader>
        <h3 className="break-words text-base font-semibold">{incident.title}</h3>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        {!current && (busy ? <LoadingPlaceholder label="Loading the latest report…" /> : <p role="status" className="mt-4 text-sm text-gray-600">Close this dialog and reopen it to retry.</p>)}
        {current && <>
          <p className="mt-2 text-sm text-gray-600">Current status: <strong>{current.status}</strong> · Services: {current.requestedServices?.join(", ") || current.type?.typeName}</p>
          {!dispositionMode && <>
            <p className="my-4 whitespace-pre-wrap break-words text-sm text-gray-700">{current.description}</p>
            <p className="mb-4 text-sm text-gray-700">Location: {current.location?.address || current.location?.locationName || "See report pin"}</p>
            {current.attachments?.[0]?.fileUrl && <CompactEvidencePhoto sourceUrl={current.attachments[0].fileUrl} alt="Report evidence for review" />}
            {!mainAdmin && <IncidentReviewNotice notices={sharedNotices} cancelled={cancelled} />}
          </>}
          {mainAdmin && !dispositionMode ? <>
            <div className="mt-4 space-y-3">{flags.map(flag => <FlagDecision key={`${flag.reviewFlagId}:${flag.updatedAt}`} flag={flag} busy={busy} cancelled={cancelled}
              onReview={(target, decision, notes) => void act(() => reviewIncidentFlag(target, decision, notes), decision === "CONFIRMED" ? "False report confirmed and excluded from verified analytics. Choose cancellation or permanent deletion below; department Resolve is not required." : "Suspicion dismissed. The report remains available.")}
              onCorrect={(target, notes) => void act(() => correctIncidentFlag(target, notes), "Correction saved in the audit log. The false-report flag was dismissed; response status is unchanged.")}
            />)}</div>
            {flags.length === 0 && <p className="mt-4 text-sm text-gray-600">No active review flags for this report.</p>}
            <div className="mt-5 border-t border-gray-200 pt-4">
              {confirmedFlag && !['CLOSED', 'CANCELLED'].includes(current.status) && <>
                <p className="text-sm leading-6 text-gray-700">Choose what happens to this confirmed false report. Return assigned units and finish tasks first. You do not need departments to click Resolve.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" disabled={busy} onClick={() => beginDisposition('cancel', confirmedFlag)} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>Cancel confirmed false report</button>
                  <button type="button" disabled={busy} onClick={() => beginDisposition('delete', confirmedFlag)} className={`${buttonClass} inline-flex items-center gap-2 border-red-300 bg-red-50 text-red-800`}><Trash2 size={16} aria-hidden="true" />Delete confirmed false report permanently</button>
                </div>
                <p className="mt-2 text-sm leading-6 text-gray-600">Cancel keeps the record and evidence. Delete removes them permanently; the audit log remains.</p>
              </>}
              {current.status === "RESOLVED" && <button type="button" disabled={busy} onClick={() => void act(() => updateIncident(current.incidentId, { status: "CLOSED" }), "Report closed. Permanent deletion is now available after confirmation.")} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>Close resolved report</button>}
              {['CLOSED', 'CANCELLED'].includes(current.status) && <button type="button" disabled={busy} onClick={() => beginDisposition('delete')} className={`${buttonClass} inline-flex items-center gap-2 border-red-300 bg-red-50 text-red-800`}><Trash2 size={16} aria-hidden="true" />Delete {cancelled ? 'cancelled' : 'closed'} report permanently</button>}
              {!confirmedFlag && !["RESOLVED", "CLOSED", 'CANCELLED'].includes(current.status) && <p className="mt-3 text-sm text-gray-600">Wait for the assigned departments to resolve their responses, then close the report here. Return assigned units and finish tasks before deleting.</p>}
              {cancelled && <p className="mt-3 text-sm text-gray-600">Cancelled by Main Admin. The record and evidence are retained. No department Resolve action is needed.</p>}
            </div>
          </> : !mainAdmin && cancelled ? <p className="mt-4 text-sm text-gray-700">Main Admin cancelled this report. History and evidence remain available; do not mark it resolved.</p> : !mainAdmin && !dispositionMode && ownFlag ? <p className="mt-4 text-sm text-amber-800">{ownFlag.status === "CONFIRMED" ? "The main admin confirmed this report as false." : "Your department already has a review request for this report."}</p> : <form className="mt-5" onSubmit={event => {
            event.preventDefault();
            if (busy || reason.trim().length < 10 || (deleteMode && confirmation !== 'DELETE')) return;
            if (cancelMode && falseTarget) void act(() => cancelFalseIncident(current.incidentId, reason, falseTarget), 'Confirmed false report cancelled. Record and evidence retained.');
            else if (deleteMode) void act(() => deleteIncident(current.incidentId, reason, confirmation, falseTarget), "Report permanently deleted.", true);
            else void act(() => flagIncident(current.incidentId, reason), "Review request saved. The main admin can now review it.");
          }}>
            <label htmlFor={`${inputId}-reason`} className="block text-sm font-medium">{deleteMode ? "Reason for permanent deletion" : cancelMode ? 'Reason for cancellation' : "Why do you suspect this report is false?"}</label>
            <textarea id={`${inputId}-reason`} value={reason} onChange={event => setReason(event.target.value)} rows={3} required minLength={10} maxLength={500} disabled={busy} className={fieldClass} aria-describedby={`${inputId}-help`} />
            <p id={`${inputId}-help`} className="mt-1 text-xs text-gray-600">Use 10–500 characters. Explain the facts supporting your decision.</p>
            {deleteMode && <>
              <label htmlFor={`${inputId}-confirmation`} className="mt-4 block text-sm font-medium">Type DELETE to confirm</label>
              <input id={`${inputId}-confirmation`} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} required disabled={busy} className={fieldClass} />
              <p className="mt-3 text-sm text-red-800">Check the report identity and evidence before proceeding. Missing historical photos alone are not a reason to delete a report.</p>
            </>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => { if (dispositionMode) { setDeleteMode(false); setCancelMode(false); setFalseTarget(undefined); } else setOpen(false); }} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>{cancelMode ? 'Go back' : 'Cancel'}</button>
              <button type="submit" disabled={busy || reason.trim().length < 10 || (deleteMode && confirmation !== "DELETE")} className={`${buttonClass} border-red-700 bg-red-600 text-white hover:bg-red-700`}>{busy ? "Saving…" : deleteMode ? "Permanently delete report" : cancelMode ? 'Confirm cancellation' : "Send review request"}</button>
            </div>
          </form>}
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
