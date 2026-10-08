"use client";

import { Suspense, useRef } from "react";
import { AccountEmailEntry } from "../component/EmailVerification";
import { LandingHeader } from "../component/landing/LandingHeader";

export default function LoginRoute() {
  const scrollContainer = useRef<HTMLDivElement>(null);
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <LandingHeader accountPage scrollContainer={scrollContainer} />

      {/* Scroll padding helps focused controls clear the floating theme switch
          without reserving a visible strip outside the page content. */}
      <div ref={scrollContainer} data-account-scroll className="min-h-0 flex-1 scroll-pb-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] overflow-y-auto overscroll-contain">
      <div className="flex min-h-full flex-col">

      {/* Auth Content */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <Suspense
          fallback={
            <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-400">
              Loading portal...
            </div>
          }
        >
          <AccountEmailEntry />
        </Suspense>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-500 dark:text-slate-400 sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} Municipal Government of Cordova, Cebu.
            All operational rights reserved.
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            For immediate danger, call the national emergency hotline at 911.
          </p>
        </div>
      </footer>
      </div>
      </div>
    </div>
  );
}
