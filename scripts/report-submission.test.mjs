import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { confirmedOwnReport, submissionIdentity, startSubmissionTiming } from '../src/lib/reportSubmission.ts';

const report = { incidentId: 'synthetic', reportedBy: 'owner', title: 'Synthetic', reportedAt: '2026-10-24T00:00:00Z', status: 'RESPONDING' };
test('receipt validation requires a real own-account report before showing success', () => {
  assert.equal(confirmedOwnReport(report, 'owner'), true);
  for (const change of [{ reportedBy: 'other' }, { incidentId: '' }, { reportedAt: 'invalid' }, { status: 'unknown' }]) {
    assert.equal(confirmedOwnReport({ ...report, ...change }, 'owner'), false);
  }
  assert.equal(confirmedOwnReport({}, 'owner'), false);
});

test('submission identity changes on account, session generation or logout; inaccessible storage fails closed', () => {
  const values = new Map([['user', JSON.stringify({ id: 'owner', role: 'USER' })]]);
  const storage = { getItem: key => values.get(key) ?? null };
  const first = submissionIdentity('owner', storage);
  assert.ok(first); assert.equal(submissionIdentity('other', storage), null);
  values.set('emergency-session-generation', 'renewed');
  assert.notEqual(submissionIdentity('owner', storage), first);
  const renewed = submissionIdentity('owner', storage);
  values.set('emergency-logout-epoch', 'ended');
  assert.notEqual(submissionIdentity('owner', storage), renewed);
  values.set('user', JSON.stringify({ id: 'owner', role: 'ADMIN' }));
  assert.equal(submissionIdentity('owner', storage), null);
  assert.equal(submissionIdentity('owner', { getItem: () => { throw Error('blocked'); } }), null);
});

test('local performance entries stay bounded, fixed-name and payload-free across retries', () => {
  for (let retry = 0; retry < 4; retry++) {
    const stages = []; const timing = startSubmissionTiming(stage => stages.push(stage));
    timing.move('checking-session'); timing.move('photo-upload'); timing.move('verify-save'); timing.finish(true); timing.finish();
    assert.deepEqual(stages, ['checking-session', 'photo-upload', 'verify-save']);
  }
  const entries = performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('citizen-report:'));
  assert.equal(entries.length, 4);
  for (const entry of entries) { assert.ok(entry.duration >= 0); assert.equal(entry.detail, null); }
});

// Execute the actual service source with injected transport/timers only. This
// exercises timeout/cancellation without real credentials, uploads or API writes.
async function serviceHarness(file, apiClient, dependencies = {}) {
  const source = await readFile(new URL(`../src/lib/services/${file}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(dependencies), code)(
    () => ({ default: apiClient }), exports, ...Object.values(dependencies));
  return exports;
}

for (const part of ['headers', 'body']) test(`direct photo timeout covers ${part} and never repeats through fallback`, async () => {
  let deadline, started, fallbacks = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const api = { post: async path => {
    if (path.includes('/image')) fallbacks++;
    return { data: { data: { cloudName: 'synthetic', apiKey: 'synthetic', timestamp: 1, folder: 'synthetic', publicId: 'synthetic', allowed_formats: 'jpg', signature: 'synthetic', type: 'authenticated' } } };
  } };
  const service = await serviceHarness('uploadService', api, {
    setTimeout: (callback, delay) => { assert.equal(delay, 60_000); deadline = callback; return 1; }, clearTimeout: () => {},
    fetch: async (_url, { signal }) => {
      const stalled = () => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); started(); });
      return part === 'headers' ? stalled() : { ok: true, json: stalled };
    },
  });
  const result = service.uploadIncidentPhoto(new File(['synthetic'], 'synthetic.jpg', { type: 'image/jpeg' }));
  const rejected = assert.rejects(result, /Photo upload timed out/);
  await ready; deadline(); await rejected;
  assert.equal(fallbacks, 0);
});

test('parent cancellation during direct upload never starts fallback', async () => {
  let started, fallbacks = 0; const ready = new Promise(resolve => { started = resolve; });
  const service = await serviceHarness('uploadService', { post: async path => {
    if (path.includes('/image')) fallbacks++;
    return { data: { data: { cloudName: 'synthetic' } } };
  } }, { fetch: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); started();
  }) });
  const controller = new AbortController();
  const result = service.uploadIncidentPhoto(new File(['synthetic'], 'synthetic.jpg', { type: 'image/jpeg' }), { signal: controller.signal });
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await ready; controller.abort(); await rejected; assert.equal(fallbacks, 0);
});

test('post-save fresh read bypasses pre-save deduplication without breaking ordinary reads', async () => {
  const pending = [];
  const service = await serviceHarness('incidentService', { get: () => new Promise(resolve => pending.push(resolve)) });
  const old = service.getIncidentPage({ reportedBy: 'owner' });
  assert.equal(service.getIncidentPage({ reportedBy: 'owner' }), old);
  const fresh = service.getIncidentPage({ reportedBy: 'owner' }, { fresh: true });
  assert.notEqual(old, fresh); assert.equal(pending.length, 2);
  assert.equal(service.getIncidentPage({ reportedBy: 'owner' }), fresh);
  pending[1]({ data: { data: { incidents: [report] } } });
  assert.deepEqual((await fresh).incidents, [report]);
  // A later ordinary read must not resurrect the still-pending pre-save read.
  const next = service.getIncidentPage({ reportedBy: 'owner' });
  assert.equal(pending.length, 3);
  pending[0]({ data: { data: { incidents: [] } } }); await old;
  assert.equal(service.getIncidentPage({ reportedBy: 'owner' }), next);
  pending[2]({ data: { data: { incidents: [report] } } }); await next;
});
