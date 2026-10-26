import type { Incident, IncidentReviewFlag, VerificationStatus } from "@/lib/services/incidentService";

export default function IncidentVerificationLabel({ status, reviewFlags, reportReview }: { status?: VerificationStatus; reviewFlags?: IncidentReviewFlag[]; reportReview?: Incident['reportReview'] }) {
  if (reportReview?.departmentReviewEnabled ? reportReview.wholeConfirmedFalse : reviewFlags?.some(flag => flag.status === 'CONFIRMED')) return <p className="mb-4 text-sm leading-relaxed text-amber-900">
    <span className="font-semibold">Confirmed false report.</span> Excluded from verified analytics; retained in False Reports with evidence and audit history. No Resolve action is needed.
  </p>;
  if (status === "VERIFIED") {
    return <p className="mb-4 text-sm leading-relaxed text-green-800">
      <span className="font-semibold">Verified report.</span> {reviewFlags ? 'Included in verified analytics.' : 'Confirmed-false reports are excluded from verified analytics.'}
    </p>;
  }

  if (status === "PENDING" || status === "REJECTED") {
    return <p className="mb-4 text-sm leading-relaxed text-amber-900">
      <span className="font-semibold">{status === "PENDING" ? "Pending verification." : "Rejected report."}</span>{" "}
      Excluded from verified analytics; retained in all report records.
    </p>;
  }

  return <p className="mb-4 text-sm leading-relaxed text-gray-700">
    <span className="font-semibold">Verification unavailable.</span> Analytics inclusion could not be determined. Refresh to try again.
  </p>;
}
