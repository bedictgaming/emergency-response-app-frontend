import Link from 'next/link';
import { PhoneCall, Shield } from 'lucide-react';

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight text-slate-950 sm:text-base dark:text-white">
              Cordova Emergency Response
            </span>
            <span className="hidden text-xs text-slate-600 sm:block dark:text-slate-400">
              Community emergency reporting
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-6 lg:flex">
          <a href="#services" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-300 dark:hover:text-white">
            Services
          </a>
          <a href="#workflow" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-300 dark:hover:text-white">
            How reporting works
          </a>
          <a href="#hotlines" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-300 dark:hover:text-white">
            Emergency help
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href="tel:911"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900 dark:focus-visible:ring-offset-slate-950"
            aria-label="Call 911"
          >
            <PhoneCall className="h-4 w-4 text-red-600" aria-hidden="true" />
            <span className="hidden sm:inline">Call 911</span>
          </a>
          <Link
            href="/login"
            className="theme-inverse-surface theme-inverse-action inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
