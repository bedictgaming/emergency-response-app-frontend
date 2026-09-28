'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { getAlerts } from '@/lib/services/alertService';
import type { PublicAlert } from '@/lib/types/alert';

export function PublicAlertsSection() {
  const [alerts, setAlerts] = useState<PublicAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getAlerts()
      .then((data) => {
        if (isMounted) {
          setAlerts(data || []);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAlerts([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="w-full border-t border-slate-200 bg-slate-50 py-12 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Public safety advisories
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Published advisories appear here when they are available from the emergency alert service.
          </p>
        </div>

        <div className="mt-6">
          {isLoading ? (
            <div className="h-20 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
          ) : loadError ? (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Public alerts are currently unavailable.</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Use verified emergency channels if you need immediate help.</p>
              </div>
            </div>
          ) : alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.alertId}
                  className="flex items-start gap-3.5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 shadow-2xs dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-amber-200/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                        {alert.severity}
                      </span>
                      <span className="text-xs text-amber-800 dark:text-amber-300">
                        {new Date(alert.sentAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-snug">
                      {alert.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <ShieldCheck className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-semibold">No public alerts have been published.</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Check again later for new advisories.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
