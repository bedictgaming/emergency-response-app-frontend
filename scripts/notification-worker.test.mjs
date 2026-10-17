import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(receipts = new Map(), relevant = true, receiptMode = 'normal', href = 'https://app.example.test/sw.js') {
  const handlers = {};
  const shown = mock.fn(async () => {});
  const fetched = mock.fn(async () => {
    if (relevant === 'offline') throw new Error('Offline');
    return { ok: true, status: 200, json: async () => ({ relevant }) };
  });
  const indexedDB = { open: () => {
    const open = {};
    const db = { close() {}, transaction: () => {
      const tx = {};
      if (receiptMode === 'abort') {
        tx.objectStore = () => ({ get: () => ({}), put() {}, openCursor: () => ({}) });
        setTimeout(() => tx.onabort(), 0);
        return tx;
      }
      tx.objectStore = () => ({
        get: id => { const result = {}; setTimeout(() => { result.result = receipts.get(id); result.onsuccess(); tx.oncomplete(); }, 0); return result; },
        put: (value, id) => receipts.set(id, value),
        openCursor: () => {
          const keys = [...receipts.keys()], result = {}; let index = 0;
          const next = () => setTimeout(() => {
            const key = keys[index++]; result.result = key ? { value: receipts.get(key), delete: () => receipts.delete(key), continue: next } : null;
            result.onsuccess(); if (!key) tx.oncomplete();
          }, 0);
          next(); return result;
        },
      });
      return tx;
    } };
    setTimeout(() => { open.result = db; open.onsuccess(); }, 0); return open;
  } };
  const location = new URL(href);
  runInNewContext(source, { indexedDB, URL, Date, Promise, AbortController, setTimeout, clearTimeout, fetch: fetched,
    self: { location, skipWaiting() {}, addEventListener: (name, handler) => { handlers[name] = handler; },
      registration: { showNotification: shown, getNotifications: async () => [] } },
  });
  const push = async (id, extra = {}) => {
    let done;
    handlers.push({ data: { json: () => ({ title: 'Private title', body: 'Private address', data: { notificationId: id, expiresAt: new Date(Date.now() + 60000).toISOString(), ...extra } }) }, waitUntil: value => { done = value; } });
    await done;
  };
  return { push, shown, fetched, handlers };
}
const id = '00000000-0000-0000-0000-000000000001';
const calls = fn => fn.mock.calls.map(call => call.arguments);
test('does not display expired or currently irrelevant push hints', async () => {
  const live = worker(); await live.push(id, { expiresAt: new Date(Date.now() - 1).toISOString() });
  assert.equal(live.shown.mock.callCount(), 0); assert.equal(live.fetched.mock.callCount(), 0);
  const resolved = worker(undefined, false); await resolved.push(id); assert.equal(resolved.shown.mock.callCount(), 0);
});
test('keeps receipt deduplication across restarts without storing payloads', async () => {
  const receipts = new Map(), first = worker(receipts); await first.push(id); await first.push(id); assert.equal(first.shown.mock.callCount(), 1);
  const restarted = worker(receipts); await restarted.push(id); assert.equal(restarted.shown.mock.callCount(), 0);
  assert.equal(receipts.size, 1); assert.equal(typeof [...receipts.values()][0], 'number');
});
test('network outage preserves a neutral hint, not a confirmed emergency', async () => {
  const current = worker(undefined, 'offline'); await current.push(id);
  assert.equal(calls(current.shown)[0][0], 'Emergency response update');
  assert.equal(calls(current.shown)[0][1].body, 'An update is waiting. Sign in to check its current status.');
  assert.ok(!JSON.stringify(calls(current.shown)).includes('Private address'));
});
test('receipt-storage abort cannot hang or suppress a potentially genuine update', async () => {
  const current = worker(undefined, 'offline', 'abort'); await current.push(id);
  assert.equal(current.shown.mock.callCount(), 1); assert.equal(calls(current.shown)[0][0], 'Emergency response update');
  assert.equal(calls(current.shown)[0][1].body, 'An update is waiting. Sign in to check its current status.');
});
test('independent advisories have distinct identities and off-origin click URLs are rejected', async () => {
  const current = worker(); await current.push(id, { alertId: 'advisory-a', url: 'https://evil.example.test' });
  await current.push('00000000-0000-0000-0000-000000000002', { alertId: 'advisory-b' });
  assert.notEqual(calls(current.shown)[0][1].tag, calls(current.shown)[1][1].tag);
  assert.equal(calls(current.shown)[0][1].data.url, 'https://app.example.test/dashboard');
});

test('a background push handler has no dependency on any open page or live socket', async () => {
  const current = worker(); await current.push(id);
  assert.equal(current.shown.mock.callCount(), 1);
  assert.equal(calls(current.fetched)[0][1].credentials, 'include');
  assert.equal(calls(current.fetched)[0][1].cache, 'no-store');
});

test('explicit loopback push-only mode targets local API without intercepting dev assets', async () => {
  const current = worker(undefined, true, 'normal', 'http://localhost:3000/sw.js?pushOnly=1&apiOrigin=http%3A%2F%2Flocalhost%3A8000');
  await current.push(id);
  assert.equal(calls(current.fetched)[0][0], `http://localhost:8000/api/notifications/v1/${id}/relevance`);
  current.handlers.install({ waitUntil() { assert.fail('Dev worker must not precache'); } });
  current.handlers.fetch({ get request() { assert.fail('Dev worker must not intercept fetches'); } });
});

test('worker query parameters cannot redirect authenticated fetches to external origins', async () => {
  for (const href of [
    'http://localhost:3000/sw.js?pushOnly=1&apiOrigin=https%3A%2F%2Fevil.example.test',
    'http://localhost:3000/sw.js?pushOnly=1&apiOrigin=http%3A%2F%2Fuser%3Asecret%40localhost%3A8000',
    'https://app.example.test/sw.js?pushOnly=1&apiOrigin=https%3A%2F%2Fevil.example.test',
  ]) {
    const current = worker(undefined, true, 'normal', href); await current.push(id);
    assert.equal(new URL(calls(current.fetched)[0][0]).origin, new URL(href).origin);
  }
});
