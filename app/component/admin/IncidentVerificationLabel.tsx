import type { VerificationStatus } from "@/lib/services/incidentService";

export default function IncidentVerificationLabel({ status }: { status?: VerificationStatus }) {
  if (status === "VERIFIED") {
    return <p className="mb-4 text-sm leading-relaxed text-green-800">
      <span className="font-semibold">Verified report.</span> Included in verified analytics.
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
