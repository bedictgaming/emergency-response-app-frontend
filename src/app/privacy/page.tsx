import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { EmergencyLogo } from '@/components/shared/EmergencyLogo';
import { HeaderFrame } from '@/components/shared/HeaderFrame';
import { privatePageMetadata } from '@/lib/seo';

export const metadata = privatePageMetadata('Privacy notice — capstone draft', 'Draft data-handling notice for the Cordova Public College capstone project team.');

function NoticeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-28 border-t border-border pt-6">
    <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">{title}</h2>
    <div className="mt-3 space-y-3 text-base leading-7">{children}</div>
  </section>;
}

export default function PrivacyNoticePage() {
  const sections = [['data', 'Data and purpose'], ['access', 'Access and sharing'], ['retention', 'Retention'], ['requests', 'Privacy requests']] as const;
  return <div className="min-h-screen bg-background text-foreground">
    <HeaderFrame pinned surfaceClassName="flex min-h-16 items-center justify-between gap-3 px-2 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-3"><EmergencyLogo /><span className="truncate text-sm font-bold sm:text-base">Cordova Emergency Response</span></div>
      <Link href="/login?session=manual" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Log In</Link>
    </HeaderFrame>
    <main id="privacy-content" className="mx-auto max-w-[75ch] px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
      <h1 className="text-3xl font-bold tracking-tight">Privacy notice</h1>
      <p className="mt-2 text-sm text-muted-foreground">Review draft · Updated <time dateTime="2026-10-22">22 October 2026</time></p>
      <div className="mt-6 rounded-xl border border-border bg-muted p-4 text-base leading-7">
        <p className="font-semibold">For a capstone demonstration, not an official emergency-reporting channel.</p>
        <p className="mt-2">This draft explains the current project and decisions still under review. It is not a final policy for public emergency operations or a privacy-compliance certification. Prefer synthetic test accounts, reports and photos.</p>
      </div>
      <p className="mt-6 text-base leading-7">Project team: <strong>Cordova Public College capstone project team</strong>. The school name identifies the project affiliation; this notice does not claim official College or LGU emergency-service authorization.</p>
      <p className="mt-2 text-base leading-7">Privacy contact: <a href="mailto:benedictmequiabas@gmail.com" className="inline-flex min-h-11 max-w-full items-center break-all rounded-md font-semibold underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">benedictmequiabas@gmail.com</a>.</p>
      <nav aria-label="Privacy notice sections" className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3">
        {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{label}</a>)}
      </nav>
      <NoticeSection id="data" title="Data and purpose">
        <p>The demonstration uses account and report information to show sign-in, service routing, response tracking, evidence review and abuse controls.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Accounts:</strong> name, email, sign-in/session records, role and account status.</li>
          <li><strong>Reports:</strong> requested services, description, submitted contact number, recorded GPS/address, timestamps, photo evidence and response or review history.</li>
          <li><strong>Security context:</strong> request IP and bounded browser-supplied User-Agent when the request-context feature is enabled. A shared IP or browser string does not prove identity or that a report is false. The website does not collect phone IMEI.</li>
          <li><strong>Browser settings:</strong> sign-in cookies/session-related state, theme preferences, the optional online-location-sharing ON/OFF choice for each citizen account in this browser, and notification permission/subscription where enabled.</li>
        </ul>
        <p>Optional online-citizen GPS sharing is separate from submitting a report. Reading this notice does not switch it on.</p>
      </NoticeSection>
      <NoticeSection id="access" title="Access and sharing">
        <p>Authorized staff access is restricted by role and report/service scope. Main Admin alone can view the recent report IP/browser context. Other citizens cannot open another citizen&apos;s report, contact number, photo or exact report pin through nearby-report detection.</p>
        <h3 className="pt-2 text-base font-semibold">Optional exact-GPS dots</h3>
        <p>After you explicitly enable automatic location sharing, other participating citizens within 100m can see your device&apos;s reported GPS position while you remain online with the dashboard open and visible. This can reveal a recognizable place even without your name. Nearby devices must also opt in; GPS estimates do not guarantee your exact physical standing location.</p>
        <p>Your ON/OFF choice is remembered for your citizen account in this browser, including after refresh. When enabled, sharing resumes on later visible dashboard visits only after current session, WebSocket and fresh-GPS checks. Stop sharing saves OFF until you explicitly enable it again. Another account or browser does not inherit your choice. Clearing browser data resets this preference to OFF; blocked or unavailable storage is handled without silently enabling sharing.</p>
        <p>Sharing stops or expires when the tab is hidden/closed, the connection is lost, the account changes, or the location becomes stale. Hidden tabs pause without changing the saved choice. Logout stops participation; it does not turn another account&apos;s preference on. Only the choice is persisted in browser storage, not GPS coordinates or a location history. Server locations still use temporary in-memory leases of up to 30 seconds.</p>
        <h3 className="pt-2 text-base font-semibold">Services used by the project</h3>
        <p>Hosting, database, protected-photo, account-email and browser/OS push services process information needed for their functions. Loading OpenStreetMap tiles sends map-area requests to that provider. Provider arrangements and separate retention/copy handling still need review before a final notice. No SMS service is enabled by this notice.</p>
      </NoticeSection>
      <NoticeSection id="retention" title="Retention and unfinished decisions">
        <dl className="space-y-5">
          <div><dt className="font-semibold">New raw IP/browser request context — 30-day deadline</dt><dd className="mt-1">This is the selected period for the new separate context store. Capture and expiry cleanup are currently enabled only in protected local development. Expired values are withheld from reads; physical cleanup runs while that backend is available and can be delayed by downtime or failures. Live enforcement is not confirmed.</dd></div>
          <div><dt className="font-semibold">Reports, report GPS, photos, accounts and audit/violation history — under review</dt><dd className="mt-1">No new deletion period or deletion job is approved for these records. This draft does not erase evidence, decisions or account history. Deactivating an account is not the same as erasing its data.</dd></div>
          <div><dt className="font-semibold">Legacy records, encrypted backups and provider copies — separate review</dt><dd className="mt-1">The new context deadline does not erase legacy audit fields or all backup/provider copies. Keeping the newest 30 encrypted local backup files is not a promise that every copy disappears after 30 days. A safe backup/restore and disposal policy remains to be agreed.</dd></div>
        </dl>
      </NoticeSection>
      <NoticeSection id="requests" title="Questions and privacy requests">
        <p>Contact <a href="mailto:benedictmequiabas@gmail.com" className="break-all rounded-md font-semibold underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">benedictmequiabas@gmail.com</a> with a general question, an inaccuracy to review, a request concerning your data, or a challenge to an account restriction.</p>
        <p>Use your account email and describe the request without sending passwords, reset links, identity documents, evidence photos or other people&apos;s private information. The team needs to verify ownership/authority and review evidence-retention constraints before acting. This is not automatic account reactivation or self-service erasure; handling procedures and response arrangements still need confirmation.</p>
        <p>For general information, see the <a href="https://privacy.gov.ph/data-subject-rights/" rel="noreferrer" className="rounded-md font-semibold underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">National Privacy Commission&apos;s data-subject rights guidance</a>. This draft does not replace an appropriate privacy review.</p>
      </NoticeSection>
      <p className="mt-10 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">Before final publication: review purposes and processing arrangements, agree the remaining retention/backup schedules, confirm request handling, and verify hosted enforcement. No new data deletion is activated by this page.</p>
    </main>
  </div>;
}
