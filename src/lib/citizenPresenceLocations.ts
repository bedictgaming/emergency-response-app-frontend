export const PRESENCE_SHARING = 'exact-gps-v1' as const;
export type PresencePosition = { latitude: number; longitude: number; accuracy: number };
export type CitizenPresenceLayer = { latitude: number; longitude: number; positions: PresencePosition[] };
export type PresenceSnapshot = { precision: typeof PRESENCE_SHARING; radiusMeters: 100; expiresInSeconds: 30; positions: PresencePosition[] };
export function validatePresenceSnapshot(value: unknown): PresenceSnapshot {
  const result = value as PresenceSnapshot;
  if (!result || Object.keys(result).some(key => !['precision', 'radiusMeters', 'expiresInSeconds', 'positions'].includes(key))
    || result.precision !== PRESENCE_SHARING || result.radiusMeters !== 100 || result.expiresInSeconds !== 30
    || !Array.isArray(result.positions) || result.positions.length > 99
    || result.positions.some(position => !position || Object.keys(position).some(key => !['latitude', 'longitude', 'accuracy'].includes(key))
      || !Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90
      || !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180
      || !Number.isFinite(position.accuracy) || position.accuracy < 0 || position.accuracy > 100_000))
    throw new Error('Online presence unavailable');
  return result;
}

/** Render reported GPS without projection, rounding, offsets or grouping.
 * A newer live fix must not move an already captured report location. */
export function presencePositionsForMap(layer: CitizenPresenceLayer | undefined, latitude: number, longitude: number) {
  if (!layer || Math.abs(layer.latitude - latitude) > 0.00001 || Math.abs(layer.longitude - longitude) > 0.00001) return [];
  return layer.positions;
}
