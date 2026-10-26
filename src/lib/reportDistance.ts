/** Display the server's GPS-to-GPS distance, not screen pixels or a road route.
 * The API filters the unrounded value at 100 m before rounding for display.
 * A returned zero cannot prove co-location: it may be a sub-metre separation.
 */
export function formatNearbyReportDistance(metres?: number): string | null {
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0 || metres > 100) return null;
  return metres < 1 ? 'Less than 1 m' : `${Math.round(metres)} m`;
}
