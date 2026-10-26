import { reportContactHref } from '@/lib/reportContact';

/** Presentation only: callers must already hold the authorized report data. */
export function ReportContactNumber({ phone }: { phone?: string | null }) {
  const display = phone?.trim() || 'Not provided';
  const href = reportContactHref(phone);
  return href ? <a href={href} aria-label={`Call report contact ${display}`} title="Open the dialer for this report contact"
    className="inline-flex min-h-11 max-w-full items-center break-all rounded-md px-1 font-semibold underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    {display}
  </a> : <span>{display}</span>;
}
