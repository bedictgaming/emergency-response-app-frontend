import type { Incident } from '@/lib/services/incidentService';

export function FalseReportRetentionNotice({ incident }: { incident: Incident }) {
  const confirmed = incident.reportReview?.departmentReviewEnabled ? incident.reportReview.wholeConfirmedFalse
    : incident.reviewFlags?.some(flag => flag.status === 'CONFIRMED');
  if (!confirmed) return null;
  return <section aria-label="Retained false report" className="my-4 border-y border-border py-4">
    <h4 className="text-base font-semibold text-warning-foreground">Confirmed false — retained in False Reports</h4>
    <p className="mt-2 max-w-prose text-base leading-relaxed text-foreground">No Resolve action is needed. Evidence, assessments and audit history remain available. A corrected assessment returns this record to the appropriate list; it does not start a new response or reopen a cancelled report.</p>
    <p className="mt-2 text-sm text-muted-foreground">Last recorded incident status: {incident.status}. Original response history is unchanged.</p>
  </section>;
}
