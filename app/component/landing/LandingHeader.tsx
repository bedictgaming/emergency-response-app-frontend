'use client';

import Link from 'next/link';
import type { RefObject } from 'react';
import { ArrowUpRight, PhoneCall } from 'lucide-react';
import { EmergencyLogo } from '../EmergencyLogo';
import { HeaderFrame } from '../HeaderFrame';

export function LandingHeader({ accountPage = false, scrollContainer }: { accountPage?: boolean; scrollContainer?: RefObject<HTMLElement | null> }) {
  return (
    <HeaderFrame scrollContainer={scrollContainer} surfaceClassName="flex h-16 items-center justify-between gap-3 px-2 sm:px-4 lg:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">
          <EmergencyLogo />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight text-slate-950 sm:text-base dark:text-white">
              Cordova Emergency Response
            </span>
            <span className="hidden text-xs text-slate-600 sm:block dark:text-slate-400">
              Community emergency reporting
            </span>
          </span>
        </Link>

        {!accountPage && <nav aria-label="Primary navigation" className="hidden items-center gap-3 lg:flex xl:gap-5">
          <a href="#services" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-300 dark:hover:text-white">
            Services
          </a>
          <a href="#workflow" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-300 dark:hover:text-white">
            How reporting works
          </a>
          <a href="#hotlines" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-300 dark:hover:text-white">
            Emergency help
          </a>
        </nav>}

        <div className="flex shrink-0 items-center gap-2">
          <a
            href="tel:911"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900 dark:focus-visible:ring-offset-slate-950"
            aria-label="Call 911"
          >
            <PhoneCall className="h-4 w-4 text-red-600" aria-hidden="true" />
            <span className="hidden sm:inline">Call 911</span>
          </a>
          <Link
            href={accountPage ? '/' : '/login'}
            aria-label={accountPage ? 'Back to Home' : undefined}
            className="theme-inverse-surface theme-inverse-action group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            {accountPage ? 'Home' : 'Sign in'}
            <ArrowUpRight className="hidden h-4 w-4 transition-transform duration-200 sm:block motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-visible:translate-x-0.5 motion-safe:group-focus-visible:-translate-y-0.5" aria-hidden="true" />
          </Link>
        </div>
    </HeaderFrame>
  );
}
