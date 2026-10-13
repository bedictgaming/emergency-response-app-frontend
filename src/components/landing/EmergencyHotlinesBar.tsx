'use client';

import { Flame, HeartPulse, PhoneCall, Radio, ShieldAlert } from 'lucide-react';

const responseServices = [
  {
    agency: 'Police response',
    department: 'Law enforcement and public safety',
    icon: ShieldAlert,
  },
  {
    agency: 'Fire response',
    department: 'Fire suppression and rescue',
    icon: Flame,
  },
  {
    agency: 'Medical response',
    department: 'Emergency medical assistance',
    icon: HeartPulse,
  },
  {
    agency: 'Hazard response',
    department: 'DRRMO rescue and hazard coordination',
    icon: Radio,
  },
];

export function EmergencyHotlinesBar() {
  return (
    <section id="hotlines" className="w-full border-y border-border bg-muted/70 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Emergency help and response services
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Call 911 when life or safety is in immediate danger. Signed-in citizens can submit a GPS- and photo-backed report for coordinated local response.
            </p>
          </div>
          <a
            href="tel:911"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <PhoneCall className="h-4 w-4" aria-hidden="true" />
            Call 911
          </a>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {responseServices.map((service) => {
            const Icon = service.icon;
            return (
              <article
                key={service.agency}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{service.agency}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{service.department}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
