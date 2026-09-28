'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Flame,
  Heart,
  HelpCircle,
  MapPin,
  Shield,
  Trash2,
} from 'lucide-react';
import type { EmergencyReport } from '../types';
import { CompactEvidencePhoto } from './SecureEvidencePhoto';
import { ContinuousPagination } from './ui/continuous-pagination';

const LocationMap = dynamic(
  () => import('./LocationMap').then((mod) => mod.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div role="status" className="flex h-[260px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        Loading incident map...
      </div>
    ),
  },
);

interface EmergencyReportsListProps {
  reports: EmergencyReport[];
  onDeleteReport?: (id: string) => void;
  page?: number;
  totalPages?: number;
  totalReports?: number;
  onPageChange?: (page: number) => void;
}

const categoryConfig = {
  fire: { label: 'Fire', icon: Flame, iconClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  medical: { label: 'Medical', icon: Heart, iconClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  police: { label: 'Police', icon: Shield, iconClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' },
  hazard: { label: 'Hazard', icon: AlertTriangle, iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  other: { label: 'Other', icon: HelpCircle, iconClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' },
} as const;

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date);
};

export function EmergencyReportsList({
  reports,
  onDeleteReport,
  page,
  totalPages,
  totalReports,
  onPageChange,
}: EmergencyReportsListProps) {
  const [expandedMapIds, setExpandedMapIds] = useState<Set<string>>(new Set());

  const toggleMap = (id: string) => {
    setExpandedMapIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (reports.length === 0) {
    return (
      <section aria-labelledby="reports-heading" className="rounded-2xl border border-slate-200 bg-white p-8 text-center sm:p-10 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="reports-heading" className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">
          No emergency reports
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">
          Your submitted reports will appear here with their latest status.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="reports-heading" className="space-y-4">
      <div>
        <h2 id="reports-heading" className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">
          Your reports
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Check the latest status and review the information you submitted.
        </p>
      </div>

      <div className="space-y-3">
        {reports.map((report) => {
          const category = categoryConfig[report.category] ?? categoryConfig.other;
          const Icon = category.icon;
          const hasGps = Number.isFinite(report.latitude) && Number.isFinite(report.longitude);
          const mapExpanded = expandedMapIds.has(report.id);
          const status = report.status === 'resolved'
            ? { label: 'Resolved', icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' }
            : report.status === 'in-progress'
              ? { label: 'Coordination in progress', icon: Clock3, className: 'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100' }
              : { label: 'Report submitted', icon: Clock3, className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' };
          const StatusIcon = status.icon;
          const services = report.requestedServices?.length
            ? report.requestedServices.map((service) => service === 'HAZARD' ? 'Hazard' : service.charAt(0) + service.slice(1).toLowerCase()).join(', ')
            : category.label;

          return (
            <article
              key={report.id}
              id={`citizen-report-${report.id}`}
              tabIndex={-1}
              className="motion-list-item scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-4 outline-none focus-visible:ring-2 focus-visible:ring-red-600 sm:p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${category.iconClass}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-950 dark:text-white">{category.label} emergency</h3>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                      Report #{report.id.slice(0, 8)} · {formatTimestamp(report.timestamp)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {status.label}
                  </span>
                  {onDeleteReport && (
                    <button
                      type="button"
                      onClick={() => onDeleteReport(report.id)}
                      aria-label={`Delete report ${report.id.slice(0, 8)}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-300 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">
                {report.description}
              </p>
              <p className="mt-3 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span className="break-words">{report.location}</span>
              </p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold">Services requested:</span> {services}
              </p>

              {report.photoUrl && (
                <div className="mt-4">
                  <CompactEvidencePhoto sourceUrl={report.photoUrl} alt="Incident Photo Evidence" />
                </div>
              )}

              {hasGps && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => toggleMap(report.id)}
                    aria-expanded={mapExpanded}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    {mapExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                    {mapExpanded ? 'Hide map' : 'Show map'}
                  </button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Open map
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              )}
              {hasGps && mapExpanded && (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <LocationMap
                    latitude={report.latitude!}
                    longitude={report.longitude!}
                    interactive={false}
                    height="260px"
                    zoom={16}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>

      {totalPages != null && totalPages > 1 && page != null && onPageChange && (
        <div className="flex flex-col items-center gap-2 pt-3">
          <ContinuousPagination totalPages={totalPages} value={page} onChange={onPageChange} />
          {totalReports != null && (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {totalReports} report{totalReports !== 1 ? 's' : ''} total
            </span>
          )}
        </div>
      )}
    </section>
  );
}
