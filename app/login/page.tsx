"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountEmailEntry } from "../component/EmailVerification";
import { EmergencyLogo } from "../component/EmergencyLogo";

export default function LoginRoute() {
  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 dark:bg-slate-950">
      {/* Compact Civic Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            <span className="text-sm font-semibold">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <EmergencyLogo size={32} />
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Cordova Emergency Response
            </span>
          </div>
        </div>
      </header>

      {/* Auth Content */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
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
  );
}
