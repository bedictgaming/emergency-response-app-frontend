import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  MapPin,
  PhoneCall,
  Radio,
  ShieldCheck,
} from 'lucide-react';

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
    <section className="w-full border-b border-slate-200 bg-white py-12 sm:py-16 lg:py-20 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)] lg:px-8">
        <div className="max-w-2xl">
          <h1 className="max-w-[13ch] text-balance text-4xl font-bold tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.04] dark:text-white">
            Report an emergency. Share the details responders need.
          </h1>
          <p className="mt-5 max-w-[62ch] text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
            Send your location, incident details, and a current photo to authorized Cordova response teams.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/login"
              className="motion-press group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-red-600 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              Report an emergency
              <ArrowRight className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5" aria-hidden="true" />
            </Link>
            <a
              href="tel:911"
              className="motion-press inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900 dark:focus-visible:ring-offset-slate-950"
            >
              <PhoneCall className="h-4 w-4 text-red-600" aria-hidden="true" />
              Call 911
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-start gap-3 border-b border-slate-200 pb-5 dark:border-slate-800">
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

          <ol className="mt-5 space-y-5">
            {reportSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="motion-workflow-step grid grid-cols-[44px_1fr] gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-red-600 dark:border-slate-700 dark:bg-slate-950">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
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

          <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-white p-4 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p>After submission, sign in to track the status of your own reports.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
