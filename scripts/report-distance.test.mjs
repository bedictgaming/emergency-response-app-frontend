import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNearbyReportDistance } from '../src/lib/reportDistance.ts';

for (const [value, expected] of [[0, 'Less than 1 m'], [0.4, 'Less than 1 m'], [1, '1 m'], [2, '2 m'], [84, '84 m'], [84.4, '84 m'], [84.6, '85 m'], [100, '100 m']]) {
  test(`formats the server distance ${value} without claiming physical GPS precision`, () => assert.equal(formatNearbyReportDistance(value), expected));
}
for (const value of [undefined, null, NaN, Infinity, -1, 100.01, '84']) {
  test(`rejects unavailable or out-of-range distance ${String(value)}`, () => assert.equal(formatNearbyReportDistance(value), null));
}
