"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LandingHeader } from "../components/landing/LandingHeader";
import { LandingHero } from "../components/landing/LandingHero";
import { CitizenDashboardPreview } from "../components/landing/CitizenDashboardPreview";
import { ResponseServicesMarquee } from "../components/landing/ResponseServicesMarquee";
import { ParticleBackground } from "../components/landing/ParticleBackground";
import landingStyles from "../components/landing/landing-motion.module.css";
import { EmergencyHotlinesBar } from "../components/landing/EmergencyHotlinesBar";
import { ServicesBento } from "../components/landing/ServicesBento";
import { WorkflowSection } from "../components/landing/WorkflowSection";
import { BarangayCoverageSection } from "../components/landing/BarangayCoverageSection";
import { PublicAlertsSection } from "../components/landing/PublicAlertsSection";
import { LandingFooter } from "../components/landing/LandingFooter";
import { SessionRestoreBoundary } from "../components/auth/SessionRestoreBoundary";

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
