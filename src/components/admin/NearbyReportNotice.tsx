import type { Incident } from '@/lib/services/incidentService';

export default function NearbyReportNotice({ warning }: { warning?: Incident['nearbyReportWarning'] }) {
  if (!warning) return null;
  return <p role="note" aria-label="Nearby report advisory" className="my-3 max-w-prose text-base leading-relaxed text-foreground">
    <span className="font-semibold">{warning === 'POSSIBLE_DUPLICATE' ? 'Possible duplicate — assess both reports. ' : 'Nearby report check unavailable. '}</span>
    {warning === 'POSSIBLE_DUPLICATE'
      ? 'Another active report for an overlapping service is within 100 metres. These may be separate emergencies; proximity does not confirm duplication.'
      : 'Continue assessing this report. Do not assume there are no related reports.'}
  </p>;
}
