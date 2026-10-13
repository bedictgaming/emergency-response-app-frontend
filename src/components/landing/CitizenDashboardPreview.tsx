"use client";
import { MacbookScroll } from "@/components/ui/macbook-scroll";

export function CitizenDashboardPreview() {
 return <section aria-labelledby="dashboard-preview-heading" className="overflow-hidden px-4 py-12 sm:px-6 sm:py-16">
   <div className="mx-auto max-w-5xl">
     <MacbookScroll src="/images/citizen-dashboard-preview.png" title={<div className="mx-auto max-w-2xl text-center">
       <h2 id="dashboard-preview-heading" className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Your emergency report, in one place.</h2>
       <p className="mt-4 text-base leading-7 text-muted-foreground">Choose the service you need, submit your report, and follow its status from your citizen dashboard.</p>
     </div>} />
     <p className="mt-4 text-center text-sm text-muted-foreground">Dashboard preview · Demonstration data, not live emergency reports.</p>
   </div>
 </section>;
}
