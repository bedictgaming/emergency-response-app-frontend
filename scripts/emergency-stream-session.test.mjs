import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const sessionEvent = 'emergency-session-changed';
const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
async function load(file, modules, globals) {
  const source = await readFile(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (!(name in modules)) throw Error('Unexpected fixture import');
    return modules[name];
  }, exports, ...Object.values(globals)); return exports;
}
async function fixture() {
  const window = new EventTarget(), document = new EventTarget(), storage = new Map();
  document.visibilityState = 'visible'; window.location = { replace: () => { throw Error('Unexpected navigation'); } };
  const timers = new Map(), transports = []; let timerId = 0;
  window.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const stream = await load('emergencyEventStream', {
    '@/lib/apiClient': { API_ORIGIN: '', SESSION_CHANGED_EVENT: sessionEvent, ensureFreshSession: async () => {}, isDefinitiveAuthFailure: () => false, markSessionEnded: () => {} },
    '@/lib/adminAccountSnapshot': { adminAccountSnapshot: () => 'synthetic:USER:' },
    '@/lib/authorization': { accountHome: () => '/dashboard' },
    '@/lib/services/authService': { getMeFresh: async () => { throw Error('Unexpected profile request'); } },
    '@/lib/emergencyTransport': { createEmergencyTransport: async () => {
      const transport = { onopen: null, onerror: null, closed: false, addEventListener() {}, start() { this.onopen?.(); }, close() { this.closed = true; } };
      transports.push(transport); return transport;
    } },
  }, { window, document, localStorage, navigator: { onLine: true } });
  const states = [], off = stream.subscribeEmergencyStream({ refresh() {}, state: next => states.push(next) }); await tick();
  const advance = async () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); await tick(); };
  return { window, document, localStorage, timers, transports, stream, states, off, advance };
}
test('same-tab session renewal closes the old shared socket before reconnecting', async () => {
  const f = await fixture(), other = f.stream.subscribeEmergencyStream({ refresh() {} });
  assert.equal(f.transports.length, 1); assert.equal(f.states.at(-1), 'live');
  f.window.dispatchEvent(new Event(sessionEvent));
  assert.equal(f.transports[0].closed, true); assert.equal(f.states.at(-1), 'recovering');
  await f.advance(); assert.equal(f.transports.length, 2); assert.equal(f.states.at(-1), 'live'); other(); f.off();
});
test('cross-tab rotation rebinds once, but logout never reconnects the old account', async () => {
  const f = await fixture(), changed = new Event('storage'); Object.defineProperty(changed, 'key', { value: 'emergency-session-generation' });
  f.window.dispatchEvent(changed); await f.advance(); assert.equal(f.transports.length, 2);
  f.localStorage.setItem('emergency-logout-epoch', 'ended'); f.window.dispatchEvent(new Event(sessionEvent)); await f.advance();
  assert.equal(f.transports.length, 2); assert.equal(f.states.at(-1), 'signed-out'); f.off();
});
test('hidden renewal closes the old connection without opening a hidden replacement', async () => {
  const f = await fixture(); f.document.visibilityState = 'hidden';
  f.window.dispatchEvent(new Event(sessionEvent)); await f.advance();
  assert.equal(f.transports[0].closed, true); assert.equal(f.transports.length, 1);
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange')); await tick();
  assert.equal(f.transports.length, 2); f.off();
});
test('conflict recovery shares one timer and cleanup removes its listeners', async () => {
  const f = await fixture(); f.stream.reconnectEmergencyStream(); f.stream.reconnectEmergencyStream();
  assert.equal(f.timers.size, 1); await f.advance(); assert.equal(f.transports.length, 2);
  f.off(); f.window.dispatchEvent(new Event(sessionEvent)); f.stream.reconnectEmergencyStream(); await f.advance();
  assert.equal(f.transports.length, 2); assert.equal(f.timers.size, 0);
});
test('real session marker functions notify this tab without exposing session values', async () => {
  const window = new EventTarget(), values = new Map(), events = [];
  window.location = { origin: 'http://localhost:3000' };
  window.addEventListener(sessionEvent, event => events.push(event));
  const api = { interceptors: { request: { use() {} }, response: { use() {} } } };
  const client = await load('apiClient', {
    axios: { default: { create: () => api } }, './public-origins.mjs': { resolveApiOrigin: () => 'http://localhost:8000' },
  }, { window, document: { cookie: '' }, localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } });
  client.markSessionChanged(); assert.equal(events.length, 1); assert.ok(values.has('emergency-session-generation'));
  client.markSessionEnded(); assert.equal(events.length, 2); assert.equal(values.has('emergency-session-generation'), false);
  assert.ok(values.has('emergency-logout-epoch')); assert.equal(events.every(event => !('detail' in event)), true);
});
