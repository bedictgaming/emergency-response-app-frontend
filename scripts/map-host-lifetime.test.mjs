import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseDetachedMap } from '../src/lib/mapHostLifetime.ts';
const flush = () => new Promise(resolve => queueMicrotask(resolve));
function lifetime(connected) {
  let calls = 0;
  return { node: { isConnected: connected }, map: { remove: () => { calls++; } }, removed: false, calls: () => calls };
}
test('connected Activity/StrictMode ref replay does not destroy the map', async () => {
  const owner = lifetime(true); let cleared = false;
  releaseDetachedMap(owner, () => { cleared = true; }); await flush();
  assert.equal(owner.calls(), 0); assert.equal(owner.removed, false); assert.equal(cleared, false);
});
test('a real disconnected host is disposed only once across repeated cleanups', async () => {
  const owner = lifetime(false); let clears = 0;
  for (let index = 0; index < 3; index++) releaseDetachedMap(owner, () => { clears++; });
  assert.equal(owner.calls(), 0); await flush();
  assert.equal(owner.calls(), 1); assert.equal(clears, 1); assert.equal(owner.removed, true);
});
test('a host reconnected before the commit microtask retains its live map', async () => {
  const owner = lifetime(false);
  releaseDetachedMap(owner, () => assert.fail('not detached')); owner.node.isConnected = true; await flush();
  assert.equal(owner.calls(), 0); assert.equal(owner.removed, false);
});
test('an old owner cleanup cannot clear a replacement owner', async () => {
  const old = lifetime(false), next = lifetime(true); const ref = { current: old };
  releaseDetachedMap(old, removed => { if (ref.current === removed) ref.current = null; });
  ref.current = next; await flush();
  assert.equal(old.calls(), 1); assert.equal(next.calls(), 0); assert.equal(ref.current, next);
});
test('simultaneous map hosts have independent disposal', async () => {
  const visible = lifetime(true), detached = lifetime(false);
  releaseDetachedMap(visible, () => assert.fail('live host removed'));
  releaseDetachedMap(detached, () => {}); await flush();
  assert.equal(visible.calls(), 0); assert.equal(detached.calls(), 1);
});
test('layer cleanup can finish before the map is removed', async () => {
  const order = [], owner = lifetime(false);
  owner.map.remove = () => order.push('map removed');
  releaseDetachedMap(owner, () => order.push('owner cleared')); order.push('layer cleanup'); await flush();
  assert.deepEqual(order, ['layer cleanup', 'map removed', 'owner cleared']);
});
test('an absent owner is a no-op', async () => {
  releaseDetachedMap(null, () => assert.fail('no owner')); await flush();
});
