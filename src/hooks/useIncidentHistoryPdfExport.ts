"use client";

import { useEffect, useRef, useState } from 'react';
import apiClient from '@/lib/apiClient';
import { ADMIN_ROLES, getAdminDepartment } from '@/lib/authorization';
import { collectHistoryPdfRecords, HistoryPdfExportError, HISTORY_PDF_BATCH_SIZE } from '@/lib/historyPdfExport';
import { getIncidentHistory, type IncidentHistoryFilters } from '@/lib/services/incidentHistoryService';
import type { DashboardAnalytics, ResolvedSummaryItem } from '@/types/barangay-history';

function actor(value: unknown): string | null {
  const u = value as { id?: string; role?: string; department?: string; isMainAdmin?: boolean } | null;
  return u && typeof u.id === 'string' && ADMIN_ROLES.has(u.role ?? '') && getAdminDepartment(u.department)
    ? JSON.stringify([u.id, u.role, u.department, Boolean(u.isMainAdmin)]) : null;
}
function localActor() {
  try { return actor(JSON.parse(localStorage.getItem('user') ?? 'null')); } catch { return null; }
}
function session() {
  return JSON.stringify([localActor(), localStorage.getItem('emergency-session-generation'), localStorage.getItem('emergency-logout-epoch')]);
}
function counts(total: number, resolved: number) {
  return Number.isSafeInteger(total) && Number.isSafeInteger(resolved) && total >= 0 && resolved >= 0 && resolved <= total;
}
function validMonthly(value: ResolvedSummaryItem | undefined, period: string) {
  return value && `${value.year}-${String(value.month).padStart(2, '0')}` === period
    && counts(value.totalReportedThisMonth, value.resolvedThisMonth);
}
function validAnalytics(value: DashboardAnalytics | undefined): value is DashboardAnalytics {
  return Boolean(value && Array.isArray(value.incidentsByBarangay?.rankings)
    && Array.isArray(value.incidentsByType?.distribution) && value.resolvedSummary
    && counts(value.resolvedSummary.totalHistorical, value.resolvedSummary.totalResolvedAllTime));
}

/** Existing server-authorized reads only. Never retain an export across sessions. */
export function useIncidentHistoryPdfExport(options: {
  enabled: boolean; filters: IncidentHistoryFilters; labels: [string, string][]; period: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const job = useRef<AbortController | null>(null);
  const selection = JSON.stringify([options.filters, options.period]);
  useEffect(() => {
    // Cancel if the page unmounts, authorization is lost, or the selection changes.
    return () => { job.current?.abort(); };
  }, [selection, options.enabled]);

  const exportPdf = async () => {
    if (job.current || !options.enabled) return;
    const owner = localActor(), captured = session(), controller = new AbortController();
    if (!owner) { setError('Sign in again before exporting.'); return; }
    const assertCurrent = () => {
      if (controller.signal.aborted || session() !== captured) throw new DOMException('Export cancelled', 'AbortError');
    };
    const changed = () => { if (session() !== captured) controller.abort(); };
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
    window.addEventListener('storage', changed);
    job.current = controller; setBusy(true); setError(''); setMessage('Preparing PDF: reading all matching records…');
    try {
      const generatedAt = new Date(), signal = controller.signal;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(options.period)) throw new Error('SUMMARY_UNAVAILABLE');
      const [year, month] = options.period.split('-').map(Number);
      // Pin the existing upper submission-time filter. This bounds new inserts,
      // but is not a transactionally locked snapshot of changing report states.
      const incidents = await collectHistoryPdfRecords(page => getIncidentHistory({
        ...options.filters, to: generatedAt.toISOString(), page,
      }, { limit: HISTORY_PDF_BATCH_SIZE, signal }), assertCurrent);
      setMessage(`Preparing PDF: ${incidents.length} records and verified summaries…`);
      const [dashboard, resolved, fontResponse, renderer] = await Promise.all([
        apiClient.get<{ data: DashboardAnalytics }>('/analytics/v1/dashboard', { signal }),
        apiClient.get<{ data: ResolvedSummaryItem }>('/analytics/v1/resolved-summary', { params: { year, month }, signal }),
        fetch('/pdf-fonts/DejaVuSans.ttf', { signal, credentials: 'omit' }),
        import('@/lib/incidentHistoryPdf'),
      ]);
      assertCurrent();
      const analytics = dashboard.data?.data, monthly = resolved.data?.data;
      if (!validAnalytics(analytics) || !validMonthly(monthly, options.period) || !fontResponse.ok) throw new Error('SUMMARY_UNAVAILABLE');
      const font = new Uint8Array(await fontResponse.arrayBuffer()); assertCurrent();
      const user = JSON.parse(owner) as [string, string, string, boolean];
      const buffer = renderer.buildIncidentHistoryPdf({ incidents, analytics, monthly, generatedAt,
        filters: options.labels, scope: user[3] ? 'Main administrator - all authorized departments' : `${user[2]} department - server-authorized records`, font });
      assertCurrent();
      // Revalidate with the server immediately before handing private bytes to
      // the browser. Local storage is a stale-result guard, never authorization.
      const me = await apiClient.get<{ data: { user: unknown } }>('/auth/v1/me', { signal });
      assertCurrent();
      if (actor(me.data?.data?.user) !== owner) throw new DOMException('Export cancelled', 'AbortError');
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
      const link = document.createElement('a');
      try {
        link.href = url; link.download = `cordova-barangay-history-${generatedAt.toISOString().replace(/[:.]/g, '-')}.pdf`;
        document.body.appendChild(link); assertCurrent(); link.click();
      } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      setMessage(`PDF download started: ${incidents.length} matching records, plus summaries.`);
    } catch (failure) {
      setMessage('');
      // Do not expose provider responses, private data or stale-account errors.
      if (session() === captured) setError(timedOut
        ? 'PDF export timed out. No file was downloaded. Narrow the filters and retry.'
        : controller.signal.aborted ? 'PDF export cancelled because the selection changed. Export again when ready.'
        : failure instanceof HistoryPdfExportError && failure.code === 'limit'
          ? 'More than 1,000 matching records. Narrow the filters and export again; no partial PDF was downloaded.'
        : failure instanceof HistoryPdfExportError
          ? 'Records changed or could not be verified during export. No file was downloaded. Retry the export.'
          : 'PDF could not be prepared. No file was downloaded. Check your connection and retry Export PDF.');
    } finally {
      clearTimeout(timeout); window.removeEventListener('storage', changed);
      if (job.current === controller) { job.current = null; setBusy(false); }
    }
  };
  return { exportPdf, busy, message, error };
}
