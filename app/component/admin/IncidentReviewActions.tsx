"use client";

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { useId, useState } from "react";
import { Flag, ShieldCheck, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CompactEvidencePhoto } from "../SecureEvidencePhoto";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { deleteIncident, flagIncident, getIncidentById, Incident, IncidentReviewFlag, reviewIncidentFlag, updateIncident } from "@/lib/services/incidentService";

type ReportSummary = Pick<Incident, "incidentId" | "title" | "status"> & Partial<Incident>;
const buttonClass = "min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass = "mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-2 focus:outline-offset-2 focus:outline-red-600";
const errorMessage = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message || "The action could not be completed. Refresh the report and try again.";

function FlagDecision({ flag, busy, onReview }: { flag: IncidentReviewFlag; busy: boolean; onReview: (flag: IncidentReviewFlag, decision: "CONFIRMED" | "DISMISSED", notes: string) => void }) {
  const inputId = useId();
  const [notes, setNotes] = useState("");
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
    <p className="text-sm font-semibold text-gray-900">{flag.department} · {flag.status === "PENDING" ? "Awaiting review" : "Confirmed false report"}</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{flag.reason}</p>
    {flag.status === "PENDING" ? <>
      <label htmlFor={inputId} className="mt-4 block text-sm font-medium text-gray-900">Review explanation (required)</label>
      <textarea id={inputId} value={notes} onChange={event => setNotes(event.target.value)} maxLength={500} rows={3} disabled={busy} className={fieldClass} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || notes.trim().length < 10} onClick={() => onReview(flag, "DISMISSED", notes)} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>Dismiss suspicion</button>
        <button type="button" disabled={busy || notes.trim().length < 10} onClick={() => onReview(flag, "CONFIRMED", notes)} className={`${buttonClass} border-amber-300 bg-amber-100 text-amber-900`}>Confirm false report</button>
      </div>
    </> : <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">Review: {flag.reviewNotes}</p>}
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
  const activeFlag = incident.reviewFlags?.find(flag => flag.status !== "DISMISSED");

  const openReport = async () => {
    if (busy) return;
    const account = adminAccountSnapshot();
    setOpen(true); setBusy(true); setError(null); setNotice(null); setCurrent(null); setDeleteMode(false); setConfirmation(""); setReason("");
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
  const ownFlag = flags.find(flag => flag.status !== "DISMISSED");
  return <div className="mt-4 border-t border-gray-200 pt-3">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void openReport()} disabled={busy} className={`${buttonClass} inline-flex items-center gap-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
        {mainAdmin ? <ShieldCheck size={16} aria-hidden="true" /> : <Flag size={16} aria-hidden="true" />}
        {mainAdmin ? "Review / manage report" : "Flag suspected false report"}
      </button>
      {activeFlag && <span className="text-xs font-medium text-amber-800">{activeFlag.status === "CONFIRMED" ? "Main admin confirmed a false report" : "Flagged for main-admin review"}</span>}
    </div>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-xl bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle>{deleteMode ? "Permanently delete this report?" : mainAdmin ? "Review and manage report" : "Flag a suspected false report"}</DialogTitle>
          <DialogDescription>{deleteMode ? "This removes the report, its attachments and linked operational records. The audit history remains. This action cannot be undone in the app." : "Flagging requests main-admin review. The report stays visible and response work continues until an authorized administrator changes its status."}</DialogDescription>
        </DialogHeader>
        <h3 className="break-words text-base font-semibold">{incident.title}</h3>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        {!current && (busy ? <LoadingPlaceholder label="Loading the latest report…" /> : <p role="status" className="mt-4 text-sm text-gray-600">Close this dialog and reopen it to retry.</p>)}
        {current && <>
          <p className="mt-2 text-sm text-gray-600">Current status: <strong>{current.status}</strong> · Services: {current.requestedServices?.join(", ") || current.type?.typeName}</p>
          {!deleteMode && <>
            <p className="my-4 whitespace-pre-wrap break-words text-sm text-gray-700">{current.description}</p>
            <p className="mb-4 text-sm text-gray-700">Location: {current.location?.address || current.location?.locationName || "See report pin"}</p>
            {current.attachments?.[0]?.fileUrl && <CompactEvidencePhoto sourceUrl={current.attachments[0].fileUrl} alt="Report evidence for review" />}
          </>}
          {mainAdmin && !deleteMode ? <>
            <div className="mt-4 space-y-3">{flags.map(flag => <FlagDecision key={`${flag.reviewFlagId}:${flag.updatedAt}`} flag={flag} busy={busy} onReview={(target, decision, notes) => void act(() => reviewIncidentFlag(target, decision, notes), decision === "CONFIRMED" ? "False report confirmed. Resolve and close the report before deletion." : "Suspicion dismissed. The report remains available.")} />)}</div>
            {flags.length === 0 && <p className="mt-4 text-sm text-gray-600">No active review flags for this report.</p>}
            <div className="mt-5 border-t border-gray-200 pt-4">
              {["OPEN", "ACTIVE", "RESPONDING"].includes(current.status) && flags.some(flag => flag.status === "CONFIRMED") && <button type="button" disabled={busy || current.status === "OPEN"} onClick={() => void act(() => updateIncident(current.incidentId, { status: "RESOLVED" }), "Confirmed false report resolved by main-admin override. Close it before deletion.")} className={`${buttonClass} border-amber-300 bg-amber-50 text-amber-900`}>Resolve confirmed false report</button>}
              {current.status === "RESOLVED" && <button type="button" disabled={busy} onClick={() => void act(() => updateIncident(current.incidentId, { status: "CLOSED" }), "Report closed. Permanent deletion is now available after confirmation.")} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>Close resolved report</button>}
              {current.status === "CLOSED" && <button type="button" disabled={busy} onClick={() => { setDeleteMode(true); setReason(""); setNotice(null); }} className={`${buttonClass} inline-flex items-center gap-2 border-red-300 bg-red-50 text-red-800`}><Trash2 size={16} aria-hidden="true" />Delete closed report permanently</button>}
              {!["RESOLVED", "CLOSED"].includes(current.status) && <p className="mt-3 text-sm text-gray-600">Resolve the report after review, then close it here. Return assigned units and finish tasks before deleting.</p>}
            </div>
          </> : !mainAdmin && !deleteMode && ownFlag ? <p className="mt-4 text-sm text-amber-800">{ownFlag.status === "CONFIRMED" ? "The main admin confirmed this report as false." : "Your department already has a review request for this report."}</p> : <form className="mt-5" onSubmit={event => {
            event.preventDefault();
            if (deleteMode) void act(() => deleteIncident(current.incidentId, reason, confirmation), "Report permanently deleted.", true);
            else void act(() => flagIncident(current.incidentId, reason), "Review request saved. The main admin can now review it.");
          }}>
            <label htmlFor={`${inputId}-reason`} className="block text-sm font-medium">{deleteMode ? "Reason for permanent deletion" : "Why do you suspect this report is false?"}</label>
            <textarea id={`${inputId}-reason`} value={reason} onChange={event => setReason(event.target.value)} rows={3} required minLength={10} maxLength={500} disabled={busy} className={fieldClass} aria-describedby={`${inputId}-help`} />
            <p id={`${inputId}-help`} className="mt-1 text-xs text-gray-600">Use 10–500 characters. Explain the facts supporting your decision.</p>
            {deleteMode && <>
              <label htmlFor={`${inputId}-confirmation`} className="mt-4 block text-sm font-medium">Type DELETE to confirm</label>
              <input id={`${inputId}-confirmation`} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} required disabled={busy} className={fieldClass} />
              <p className="mt-3 text-sm text-red-800">Check the report identity and evidence before proceeding. Missing historical photos alone are not a reason to delete a report.</p>
            </>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => deleteMode ? setDeleteMode(false) : setOpen(false)} className={`${buttonClass} border-gray-300 bg-white text-gray-800`}>Cancel</button>
              <button type="submit" disabled={busy || reason.trim().length < 10 || (deleteMode && confirmation !== "DELETE")} className={`${buttonClass} border-red-700 bg-red-600 text-white hover:bg-red-700`}>{busy ? "Saving…" : deleteMode ? "Permanently delete report" : "Send review request"}</button>
            </div>
          </form>}
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
