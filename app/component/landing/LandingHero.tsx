'use client';

import Link from 'next/link';
import { TextScanner } from './TextScanner';
import {
  ArrowUpRight,
  Camera,
  CheckCircle2,
  MapPin,
  PhoneCall,
  Radio,
  ShieldCheck,
} from 'lucide-react';

// Centered composition adapted from Shadcn Space Hero 01 (MIT).
// See THIRD_PARTY_NOTICES.md. Product content and controls remain first-party.
const reportSteps = [
  {
    title: 'Confirm the location',
    description: 'GPS and the selected barangay help place the report in Cordova.',
    icon: MapPin,
  },
  {
    title: 'Attach current evidence',
    description: 'A current photo helps authorized staff review the emergency.',
    icon: Camera,
  },
  {
    title: 'Notify the right services',
    description: 'Choose Fire, Medical, Police, Hazard, or multiple services when needed.',
    icon: Radio,
  },
];

export function LandingHero() {
  return (
    <section aria-labelledby="landing-hero-title" className="w-full border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative isolate mx-auto flex max-w-5xl flex-col items-center py-16 text-center lg:py-20">
          <h1 id="landing-hero-title" className="text-balance text-4xl font-bold leading-[1.08] tracking-[-0.035em] text-slate-950 sm:text-6xl lg:text-7xl dark:text-white">
            <span className="block"><TextScanner text="Report an emergency." /></span>{' '}
            <span className="mt-2 block text-[1.875rem] leading-[1.15] text-red-700 sm:text-5xl dark:text-red-400">
              <TextScanner text="Share the details responders need." accent />
            </span>
          </h1>
          <p className="mt-6 max-w-[58ch] text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
            Send your location, incident details, and a current photo to authorized Cordova response teams.
          </p>
          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/login"
              className="motion-press group inline-flex min-h-12 items-center justify-center gap-5 whitespace-nowrap rounded-lg bg-red-600 py-1 pl-6 pr-1 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              Report an emergency
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary-foreground)] text-[var(--primary)]">
                <ArrowUpRight className="h-5 w-5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-visible:translate-x-0.5 motion-safe:group-focus-visible:-translate-y-0.5" aria-hidden="true" />
              </span>
            </Link>
            <a
              href="tel:911"
              className="motion-press inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900 dark:focus-visible:ring-offset-slate-950"
            >
              <PhoneCall className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
              Call 911
            </a>
          </div>
        </div>

        <div className="border-t border-slate-200 py-7 sm:py-8 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span data-testid="report-preparation-icon-tile" className="theme-inverse-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">How your report is prepared</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                The form collects the information authorized teams need to review the incident.
              </p>
            </div>
          </div>

          <ol className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
            {reportSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="motion-workflow-step flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                      <span className="sr-only">Step {index + 1}: </span>
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <p>After submission, sign in to track the status of your own reports.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
