"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LandingHeader } from "./component/landing/LandingHeader";
import { LandingHero } from "./component/landing/LandingHero";
import { EmergencyHotlinesBar } from "./component/landing/EmergencyHotlinesBar";
import { ServicesBento } from "./component/landing/ServicesBento";
import { WorkflowSection } from "./component/landing/WorkflowSection";
import { BarangayCoverageSection } from "./component/landing/BarangayCoverageSection";
import { PublicAlertsSection } from "./component/landing/PublicAlertsSection";
import { LandingFooter } from "./component/landing/LandingFooter";
import { EmailVerificationResult } from "./component/EmailVerificationResult";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get("resetToken");
    if (resetToken) {
      router.replace(`/login?resetToken=${encodeURIComponent(resetToken)}`);
    }
  }, [router]);

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 text-slate-900 selection:bg-red-500/15 selection:text-red-950 dark:bg-slate-950 dark:text-slate-100">
      <LandingHeader />
      <main>
        <div className="mx-auto max-w-3xl px-4">
          <Suspense fallback={null}><EmailVerificationResult showLoginLink /></Suspense>
        </div>
        <LandingHero />
        <EmergencyHotlinesBar />
        <ServicesBento />
        <WorkflowSection />
        <BarangayCoverageSection />
        <PublicAlertsSection />
      </main>
      <LandingFooter />
    </div>
  );
}
