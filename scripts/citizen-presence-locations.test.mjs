import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePresenceSnapshot, presencePositionsForMap } from '../src/lib/citizenPresenceLocations.ts';
const empty = { precision: 'exact-gps-v1', radiusMeters: 100, expiresInSeconds: 30, positions: [] };
const position = { latitude: 10.251123456, longitude: 123.949123456, accuracy: 15 };

test('exact sharing accepts only bounded versioned GPS positions without rounding', () => {
  assert.deepEqual(validatePresenceSnapshot(empty), empty);
  assert.deepEqual(validatePresenceSnapshot({ ...empty, positions: [position] }).positions, [position]);
});
test('rejects identities, reports, stable keys, timestamps, counts and unknown fields', () => {
  for (const extra of [{ userId: 'peer' }, { visitId: 'visit' }, { incidentId: 'report' }, { count: 1 }, { timestamp: 123 }, { id: 'stable' }]) {
    assert.throws(() => validatePresenceSnapshot({ ...empty, ...extra }));
    assert.throws(() => validatePresenceSnapshot({ ...empty, positions: [{ ...position, ...extra }] }));
  }
});
test('rejects malformed or oversized GPS and the obsolete approximate protocol', () => {
  for (const positions of [null, [null], [{ ...position, latitude: 91 }], [{ ...position, longitude: -181 }],
    [{ ...position, latitude: NaN }], [{ ...position, accuracy: -1 }], [{ ...position, accuracy: Infinity }], Array(100).fill(position)])
    assert.throws(() => validatePresenceSnapshot({ ...empty, positions }));
  for (const value of [null, 'private', { ...empty, precision: undefined }, { ...empty, precision: 'approximate' },
    { radiusMeters: 100, expiresInSeconds: 30, areas: [] }, { ...empty, radiusMeters: 200 }, { ...empty, expiresInSeconds: 300 }])
    assert.throws(() => validatePresenceSnapshot(value));
});
test('renders actual reported coordinates, not projected or quantized area centres', () => {
  const layer = { latitude: 10.251, longitude: 123.949, positions: [position, { ...position, latitude: 10.251456789 }] };
  const original = structuredClone(layer), dots = presencePositionsForMap(layer, layer.latitude, layer.longitude);
  assert.deepEqual(dots, original.positions); assert.deepEqual(layer, original);
  assert.equal(dots[0].latitude, 10.251123456); assert.equal(dots[0].longitude, 123.949123456);
});
test('does not move a captured report pin or mis-anchor presence after GPS movement', () => {
  const layer = { latitude: 10.251, longitude: 123.949, positions: [position] };
  assert.deepEqual(presencePositionsForMap(undefined, 10.251, 123.949), []);
  assert.deepEqual(presencePositionsForMap(layer, 10.252, 123.949), []);
});

test('GPS dots set their SVG class at Leaflet creation, not through a later style update', async () => {
  const map = await readFile(new URL('../src/components/citizen/LocationMap.tsx', import.meta.url), 'utf8');
  const marker = map.match(/<CircleMarker\b([\s\S]*?)\/>/)?.[1];
  assert.ok(marker, 'Presence must retain its real CircleMarker');
  assert.match(marker, /\bclassName="citizen-presence-dot"/);
  assert.doesNotMatch(marker, /pathOptions=\{\{[^}]*className/);
});
