"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LandingHeader } from "./component/landing/LandingHeader";
import { LandingHero } from "./component/landing/LandingHero";
import { CitizenDashboardPreview } from "./component/landing/CitizenDashboardPreview";
import { ResponseServicesMarquee } from "./component/landing/ResponseServicesMarquee";
import { ParticleBackground } from "./component/landing/ParticleBackground";
import landingStyles from "./component/landing/landing-motion.module.css";
import { EmergencyHotlinesBar } from "./component/landing/EmergencyHotlinesBar";
import { ServicesBento } from "./component/landing/ServicesBento";
import { WorkflowSection } from "./component/landing/WorkflowSection";
import { BarangayCoverageSection } from "./component/landing/BarangayCoverageSection";
import { PublicAlertsSection } from "./component/landing/PublicAlertsSection";
import { LandingFooter } from "./component/landing/LandingFooter";
import { EmailVerificationResult } from "./component/EmailVerificationResult";

function AccountLinkEntry() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (params.has('resetToken')) router.replace('/login?' + params.toString());
  }, [params, router]);
  return <EmailVerificationResult showLoginLink />;
}

export default function Home() {
  return (
    <div className={`${landingStyles.landingPage} min-h-[100dvh] w-full text-slate-900 selection:bg-red-500/15 selection:text-red-950 dark:text-slate-100`}>
      <ParticleBackground />
      <LandingHeader />
      <main>
        <div className="mx-auto max-w-3xl px-4">
          <Suspense fallback={null}><AccountLinkEntry /></Suspense>
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
