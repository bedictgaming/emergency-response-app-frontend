import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPresencePreference, savePresencePreference, presencePreferenceKey, PRESENCE_PREFERENCE_VERSION } from '../src/lib/citizenPresencePreference.ts';
const id = '10000000-0000-4000-8000-000000000001';
function memory() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('missing, invalid and unrecognized preferences default OFF without consent', () => {
  const store = memory(), key = presencePreferenceKey(id);
  for (const value of [null, '', 'true', 'ON', 'approximate', '{"enabled":true}', 'exact-gps-v1']) {
    if (value === null) store.removeItem(key); else store.setItem(key, value);
    assert.deepEqual(loadPresencePreference(id, store), { enabled: false, error: null });
  }
  assert.deepEqual(loadPresencePreference(undefined, store), { enabled: false, error: null });
  assert.equal(presencePreferenceKey('x'.repeat(129)), null);
  assert.equal(presencePreferenceKey('\ud800'), null);
});
test('explicit ON survives a new load and stores only a versioned choice', () => {
  const store = memory();
  assert.deepEqual(savePresencePreference(id, true, store), { enabled: true, error: null });
  assert.deepEqual(loadPresencePreference(id, store), { enabled: true, error: null });
  assert.deepEqual([...store.values], [[presencePreferenceKey(id), 'on']]);
  assert.ok(presencePreferenceKey(id).includes(PRESENCE_PREFERENCE_VERSION));
});
test('Stop saves OFF across reloads until another explicit enable', () => {
  const store = memory();
  savePresencePreference(id, true, store);
  assert.deepEqual(savePresencePreference(id, false, store), { enabled: false, error: null });
  assert.deepEqual(loadPresencePreference(id, store), { enabled: false, error: null });
  assert.equal(store.getItem(presencePreferenceKey(id)), 'off');
  savePresencePreference(id, true, store);
  assert.equal(loadPresencePreference(id, store).enabled, true);
});
test('another account or browser never inherits the choice', () => {
  const store = memory(); savePresencePreference(id, true, store);
  assert.equal(loadPresencePreference('another-account', store).enabled, false);
  assert.equal(loadPresencePreference(id, memory()).enabled, false);
  assert.notEqual(presencePreferenceKey('a:b'), presencePreferenceKey('a%3Ab'));
});
test('old precision/per-tab/automatic consent versions do not migrate to ON', () => {
  const store = memory();
  for (const key of [`exact-gps-v1:${id}`, `citizen-presence:automatic-visible-approximate-v1:${id}`, `citizen-presence:automatic-visible-exact-gps-v0:${id}`]) store.setItem(key, 'on');
  assert.equal(loadPresencePreference(id, store).enabled, false);
});
test('clearing browser data returns the account to default OFF', () => {
  const store = memory(); savePresencePreference(id, true, store); store.values.clear();
  assert.equal(loadPresencePreference(id, store).enabled, false);
});
test('blocked storage and SSR fail closed without throwing', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  assert.deepEqual(loadPresencePreference(id, blocked), { enabled: false, error: 'load' });
  assert.deepEqual(loadPresencePreference(id), { enabled: false, error: 'load' });
  assert.deepEqual(savePresencePreference(id, true, blocked), { enabled: false, error: 'start' });
});
test('read-only storage cannot automatically resume an old ON choice', () => {
  const store = memory(); store.setItem(presencePreferenceKey(id), 'on');
  store.setItem = () => { throw Error('read-only'); };
  assert.deepEqual(loadPresencePreference(id, store), { enabled: false, error: 'load' });
});
test('quota-blocked Stop removes the ON record and remains OFF on reload', () => {
  const store = memory(); savePresencePreference(id, true, store);
  store.setItem = () => { throw Error('quota'); };
  assert.deepEqual(savePresencePreference(id, false, store), { enabled: false, error: null });
  assert.equal(loadPresencePreference(id, store).enabled, false);
});
test('an unsavable Stop is OFF locally but reports that persistence failed', () => {
  const store = memory(); savePresencePreference(id, true, store);
  store.setItem = store.removeItem = () => { throw Error('read-only'); };
  assert.deepEqual(savePresencePreference(id, false, store), { enabled: false, error: 'stop' });
});
test('loading ON never overwrites a concurrent OFF from another tab', () => {
  const store = memory(), key = presencePreferenceKey(id); savePresencePreference(id, true, store);
  const set = store.setItem;
  store.setItem = (name, value) => { set(name, value); if (name.endsWith(':storage-check')) set(key, 'off'); };
  assert.equal(loadPresencePreference(id, store).enabled, false);
  assert.equal(store.getItem(key), 'off');
});
test('a silently ignored preference write is not accepted as consent', () => {
  const store = memory(); store.setItem = () => {};
  assert.deepEqual(savePresencePreference(id, true, store), { enabled: false, error: 'start' });
});
