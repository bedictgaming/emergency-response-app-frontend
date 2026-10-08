"use client";
import { useRef } from "react";
import { PhoneCall, Smartphone } from "lucide-react";
import { EmergencyLogo } from "@/app/component/EmergencyLogo";
import { useMotionActivity } from "./use-motion-activity";
import styles from "./animated-wave-footer.module.css";

export default function AnimatedWaveFooter() {
 const ref = useRef<HTMLElement>(null);
 const active = useMotionActivity(ref);
 return <footer ref={ref} data-wave-footer className={`${styles.footer} w-full border-t border-border bg-background px-4 pb-20 pt-16 text-muted-foreground sm:px-6 lg:px-8`}>
   <div className={styles.waves} aria-hidden="true">
     <svg className={`${styles.wave} ${active ? styles.running : ""}`} viewBox="0 0 3600 500" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
       {[0, 1800].map(offset => <g key={offset} transform={`translate(${offset},0)`}>
       <path d="M0 250C200 150 400 50 600 100C800 150 1000 350 1200 300C1400 250 1600 150 1800 250V500H0V250Z" fill="currentColor" className="text-primary/5" />
       <path d="M0 250C200 200 400 100 600 150C800 200 1000 350 1200 300C1400 250 1600 200 1800 250V500H0V250Z" fill="currentColor" className="text-primary/10" />
       </g>)}
     </svg>
   </div>
   <div className="mx-auto max-w-7xl">
     <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
       <div>
         <div className="flex items-center gap-3 text-foreground"><EmergencyLogo /><span className="font-bold tracking-tight">Cordova Emergency Response</span></div>
         <p className="mt-4 max-w-md text-sm leading-6">Online community emergency reporting for Fire, Medical, Police, and Hazard incidents in Cordova, Cebu.</p>
       </div>
       <nav aria-label="Footer navigation">
         <h2 className="mb-3 text-sm font-bold text-foreground">Quick links</h2>
         {[["/", "Home"], ["/#services", "Services"], ["/#workflow", "How reporting works"], ["/login", "Log in or create account"]].map(([href, label]) =>
           <a key={href} href={href} className="flex min-h-11 items-center text-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary">{label}</a>)}
       </nav>
       <div>
         <h2 className="text-sm font-bold text-foreground">Emergency help</h2>
         <a href="tel:911" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"><PhoneCall className="h-4 w-4" aria-hidden="true" />Call 911</a>
         <p className="mt-3 text-sm leading-6">For immediate danger, call the national emergency hotline.</p>
       </div>
       <div>
         <div className="flex items-center gap-2 text-foreground"><Smartphone className="h-4 w-4 text-primary" aria-hidden="true" /><h2 className="text-sm font-bold">Installable web app</h2></div>
         <p className="mt-4 text-sm leading-6">Install from a supported browser for home-screen access. Internet is still required to submit a report.</p>
       </div>
     </div>
     <p className="mt-10 border-t border-border pt-6 text-xs leading-6">© {new Date().getFullYear()} Municipal Government of Cordova, Cebu.</p>
   </div>
 </footer>;
}
