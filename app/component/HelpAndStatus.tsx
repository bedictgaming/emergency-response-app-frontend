'use client';

import { ShieldCheck, FileText, Phone } from 'lucide-react';
import type { EmergencyReport } from '../types';

type Variant = 'summary' | 'details' | 'full';

interface HelpAndStatusProps {
  variant: Variant;
  className?: string;
  reportsLoaded: boolean;
  reportsLoadError: boolean;
  latestReport: EmergencyReport | null;
  onViewReport: () => void;
}

const categoryLabels: Record<EmergencyReport['category'], string> = {
  fire: 'Fire',
  medical: 'Medical',
  police: 'Police',
  hazard: 'Hazard',
  other: 'Other or multiple services',
};

const statusLabels: Record<EmergencyReport['status'], string> = {
  pending: 'Report submitted',
  'in-progress': 'Coordination in progress',
  resolved: 'Resolved',
};

function formatReportTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date);
}

export function HelpAndStatus({
  variant,
  className = '',
  reportsLoaded,
  reportsLoadError,
  latestReport,
  onViewReport,
}: HelpAndStatusProps) {
  const showSummary = variant !== 'details';
  const showDetails = variant !== 'summary';
  const heading = variant === 'details' ? 'Latest report' : 'Help and status';

  return (
    <aside
      aria-label={heading}
      className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <h2 className="text-base font-bold tracking-tight text-slate-950 dark:text-white">{heading}</h2>

      {showSummary && (
        <div className="mt-4 space-y-5">
          <div>
            <a
              href="tel:911"
              aria-label="Call 911 for emergency help"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Call 911
            </a>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">Opens your device&apos;s calling app.</p>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-950 dark:text-white">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Reporting</h3>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">No daily report limit.</p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Similar active emergencies within 100 metres are checked for duplicates. For a separate or worsening emergency nearby, call 911.
            </p>
          </div>
        </div>
      )}

      {showDetails && (
        <div className={`${showSummary ? 'mt-5 border-t border-slate-200 pt-4 dark:border-slate-800' : 'mt-3'}`}>
          {showSummary && (
            <div className="mb-3 flex items-center gap-2 text-slate-950 dark:text-white">
              <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Latest report</h3>
            </div>
          )}
          {!reportsLoaded && !reportsLoadError ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Loading your latest report…</p>
          ) : !reportsLoaded ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Your latest report is unavailable. Retry reports to check its status.</p>
          ) : latestReport ? (
            <>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">{categoryLabels[latestReport.category]} emergency</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Submitted {formatReportTime(latestReport.timestamp)}</p>
              <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">{statusLabels[latestReport.status]}</p>
              {reportsLoadError && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Last loaded status; refresh unavailable.</p>}
              <button
                type="button"
                onClick={onViewReport}
                aria-label={`View latest ${categoryLabels[latestReport.category].toLowerCase()} report`}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-slate-950 underline underline-offset-4 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:text-white dark:hover:text-red-300 dark:focus-visible:ring-offset-slate-900"
              >
                View report
              </button>
            </>
          ) : (
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">No reports yet. Choose an emergency type to start a report.</p>
          )}
        </div>
      )}
    </aside>
  );
}
