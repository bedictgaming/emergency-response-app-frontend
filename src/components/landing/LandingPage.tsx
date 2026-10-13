"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LandingHeader } from "./LandingHeader";
import { LandingHero } from "./LandingHero";
import { CitizenDashboardPreview } from "./CitizenDashboardPreview";
import { ResponseServicesMarquee } from "./ResponseServicesMarquee";
import { ParticleBackground } from "./ParticleBackground";
import landingStyles from "./landing-motion.module.css";
import { EmergencyHotlinesBar } from "./EmergencyHotlinesBar";
import { ServicesBento } from "./ServicesBento";
import { WorkflowSection } from "./WorkflowSection";
import { BarangayCoverageSection } from "./BarangayCoverageSection";
import { PublicAlertsSection } from "./PublicAlertsSection";
import { LandingFooter } from "./LandingFooter";
import { SessionRestoreBoundary } from "../auth/SessionRestoreBoundary";

function PasswordResetEntry() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (params.has('resetToken')) router.replace('/login?' + params.toString());
  }, [params, router]);
  return null;
}

export default function Home() {
  return (
    <Suspense fallback={<LandingPage />}>
      <SessionRestoreBoundary fullPage><LandingPage /></SessionRestoreBoundary>
    </Suspense>
  );
}

function LandingPage() {
  return (
    <div className={`${landingStyles.landingPage} min-h-[100dvh] w-full text-slate-900 selection:bg-red-500/15 selection:text-red-950 dark:text-slate-100`}>
      <ParticleBackground />
      <LandingHeader />
      <main>
        <div className="mx-auto max-w-3xl px-4">
          <Suspense fallback={null}><PasswordResetEntry /></Suspense>
        </div>
        <LandingHero />
        <CitizenDashboardPreview />
        <ResponseServicesMarquee />
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
