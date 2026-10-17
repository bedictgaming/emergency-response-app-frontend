import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicReferenceCache } from '../src/lib/publicReferenceCache.ts';

test('coalesces concurrent public reference reads without duplicate requests', async () => {
  const cache = createPublicReferenceCache(); let requests = 0;
  const load = async () => { requests++; return [{ name: 'Synthetic barangay' }]; };
  await Promise.all([cache.read(load), cache.read(load), cache.read(load)]);
  await cache.read(load); assert.equal(requests, 1);
});
test('expires and fetches fresh reference values', async () => {
  let clock = 0, requests = 0;
  const cache = createPublicReferenceCache(60, () => clock);
  const load = async () => ++requests;
  assert.equal(await cache.read(load), 1); clock = 59;
  assert.equal(await cache.read(load), 1); clock = 60;
  assert.equal(await cache.read(load), 2);
});
test('does not cache failures as an empty list', async () => {
  const cache = createPublicReferenceCache();
  await assert.rejects(cache.read(async () => { throw Error('Synthetic unavailable'); }));
  assert.deepEqual(await cache.read(async () => ['Recovered']), ['Recovered']);
});
test('does not turn an expired snapshot into a successful read during outage', async () => {
  let clock = 0; const cache = createPublicReferenceCache(10, () => clock);
  await cache.read(async () => ['Old']); clock = 10;
  await assert.rejects(cache.read(async () => { throw Error('Synthetic outage'); }));
});
test('protects cached values from caller mutations', async () => {
  const cache = createPublicReferenceCache();
  const first = await cache.read(async () => [{ name: 'Original' }]); first[0].name = 'Changed';
  assert.deepEqual(await cache.read(async () => []), [{ name: 'Original' }]);
});
test('invalidation prevents an older pending request reviving the cache', async () => {
  const cache = createPublicReferenceCache(); let finish;
  const old = cache.read(() => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve(); cache.clear();
  await cache.read(async () => ['New']); finish(['Old']); await old;
  assert.deepEqual(await cache.read(async () => []), ['New']);
});
