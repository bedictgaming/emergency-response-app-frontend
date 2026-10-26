"use client";

import { LoaderSkeleton } from "@/components/ui/loaders-skeleton";

import { useEffect, useId, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { getResolvedSummary } from "@/lib/services/analyticsService";
import type { ResolvedSummaryItem } from "@/types/barangay-history";

function currentManilaPeriod() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function summaryPeriod(summary?: ResolvedSummaryItem | null) {
  return summary && Number.isInteger(summary.year) && summary.year >= 2000 && summary.year <= 9999
    && Number.isInteger(summary.month) && summary.month >= 1 && summary.month <= 12
    ? `${summary.year}-${String(summary.month).padStart(2, "0")}` : "";
}

function validCounts(total: number | undefined, resolved: number | undefined) {
  if (typeof total !== "number" || typeof resolved !== "number"
    || !Number.isSafeInteger(total) || !Number.isSafeInteger(resolved)
    || total < 0 || resolved < 0 || resolved > total) return null;
  return { total, resolved, rate: total ? Math.round(resolved / total * 100) : 0 };
}

function validSummary(summary: ResolvedSummaryItem | null | undefined, period: string) {
  if (!summary || summaryPeriod(summary) !== period) return null;
  return validCounts(summary.totalReportedThisMonth, summary.resolvedThisMonth);
}

/** Past-month reads retain the same backend verification and department scope. */
export default function MonthlyResolutionCard({ summary, compact = false, onPeriodChange }: {
  summary?: ResolvedSummaryItem | null;
  compact?: boolean;
  onPeriodChange?: (period: string) => void;
}) {
  const inputId = useId();
  const currentPeriod = currentManilaPeriod();
  const [selection, setSelection] = useState({ period: "", revision: 0 });
  const [result, setResult] = useState<{
    period: string; revision: number; data: ResolvedSummaryItem | null;
  } | null>(null);
  const period = selection.period || summaryPeriod(summary) || currentPeriod;
  const isLoading = Boolean(selection.period && (
    result?.period !== period || result?.revision !== selection.revision
  ));
  const monthly = validSummary(selection.period
    ? (isLoading ? null : result?.data) : summary, period);
  // All-time totals are independent of the selected report month and visible
  // history page. Retain the authorized dashboard aggregate as their source.
  const historical = validCounts(summary?.totalHistorical, summary?.totalResolvedAllTime);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(`${period}-01T00:00:00+08:00`));

  useEffect(() => {
    if (!selection.period) return;
    let active = true;
    const [year, month] = selection.period.split("-").map(Number);
    void getResolvedSummary({ year, month }).then(data => {
      if (active) setResult({ ...selection, data });
    });
    return () => { active = false; };
  }, [selection, summary]);

  return (
    <div aria-label="Monthly verified resolution summary" aria-busy={isLoading}
      className={`min-w-0 bg-emerald-50 rounded-xl border border-emerald-200 shadow-2xs ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-center justify-between gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-2">
        <span>Verified Reports Resolved</span>
        <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
      </div>
      <label htmlFor={inputId} className="block text-xs font-medium text-emerald-800 mb-1">Report month</label>
      <input id={inputId} type="month" value={period} min="2000-01" max={currentPeriod}
        className="w-full min-w-0 min-h-11 rounded-lg border border-emerald-200 bg-white px-2 text-base text-emerald-900 focus-visible:outline-2 focus-visible:outline-primary"
        onChange={event => {
          const next = event.target.value;
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(next) || next < "2000-01" || next > currentPeriod) return;
          setSelection(previous => ({ period: next, revision: previous.revision + 1 }));
          onPeriodChange?.(next);
        }} />
      <div aria-live="polite" className="mt-3">
        <div className={`${compact ? "text-2xl font-extrabold" : "text-4xl font-black"} text-emerald-800`}>
          {isLoading ? <LoaderSkeleton width={72} height={32} /> : monthly?.resolved ?? "—"}
        </div>
        <p className="text-xs text-emerald-800 mt-1 font-medium">
          {isLoading ? `Loading ${monthLabel} records…` : monthly
            ? `${monthLabel} · ${monthly.resolved} of ${monthly.total} verified reports (${monthly.rate}%).`
            : `${monthLabel} totals unavailable.`}
        </p>
      </div>
      <p className="text-xs text-emerald-800 mt-2">
        Reported in the selected month (Asia/Manila); currently resolved or closed, not necessarily resolved during that month.
      </p>
      <div aria-label="All-time verified resolution summary" className="mt-3 border-t border-emerald-200 pt-3 text-xs text-emerald-800">
        <p className="font-semibold">All-time verified reports resolved</p>
        <p className="mt-1">{historical
          ? `${historical.resolved} of ${historical.total} verified reports resolved across all report dates.`
          : "All-time totals unavailable."}</p>
      </div>
      {!isLoading && !monthly && (
        <button type="button" className="mt-2 min-h-11 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-900"
          onClick={() => setSelection(previous => ({ period, revision: previous.revision + 1 }))}>
          Retry monthly totals
        </button>
      )}
    </div>
  );
}
