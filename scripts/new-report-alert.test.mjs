import test from 'node:test';
import assert from 'node:assert/strict';
import { NewReportAlertGate } from '../src/lib/newReportAlertGate.ts';

const baseline = '2026-10-17T00:00:00.000Z';
const old = (id = 'old') => ({ incidentId: id, reportedAt: '2026-10-16T23:59:59.999Z' });
const fresh = (id = 'new') => ({ incidentId: id, reportedAt: '2026-10-17T00:00:00.001Z' });

test('initial outstanding work is a quiet baseline, not a new arrival', () => {
  const gate = new NewReportAlertGate();
  assert.deepEqual([...gate.observe([old(), fresh()], baseline)], []);
  assert.deepEqual([...gate.observe([old(), fresh()], baseline)], []);
});
test('only a new report after the server baseline triggers once', () => {
  const gate = new NewReportAlertGate(); gate.observe([old()], baseline);
  assert.deepEqual([...gate.observe([old(), fresh()], baseline)], ['new']);
  assert.deepEqual([...gate.observe([old(), fresh()], baseline)], []);
});
test('focus, polling, reconnect, version changes and row reappearance cannot replay reports', () => {
  const gate = new NewReportAlertGate(); gate.observe([], baseline);
  assert.equal(gate.observe([fresh()], baseline).size, 1);
  gate.observe([], baseline);
  for (let i = 0; i < 5; i++) assert.equal(gate.observe([{ ...fresh(), version: i + 2 }], baseline).size, 0);
});
test('older records newly exposed by the 50-item queue do not become new submissions', () => {
  const gate = new NewReportAlertGate(); gate.observe(Array.from({ length: 50 }, (_, i) => old(String(i))), baseline);
  assert.equal(gate.observe([old('51')], baseline).size, 0);
  assert.deepEqual([...gate.observe([old('51'), fresh()], baseline)], ['new']);
});
test('missing or malformed server time cannot manufacture a baseline from the device clock', () => {
  const gate = new NewReportAlertGate();
  for (const observedAt of [undefined, 'invalid']) assert.equal(gate.observe([fresh()], observedAt).size, 0);
  assert.equal(gate.observe([fresh()], baseline).size, 0);
  assert.deepEqual([...gate.observe([fresh('next')], baseline)], ['next']);
});
test('malformed/equal-boundary report time does not sound; later valid reports still can', () => {
  const gate = new NewReportAlertGate(); gate.observe([], baseline);
  assert.equal(gate.observe([{ incidentId: 'invalid', reportedAt: 'invalid' }, { incidentId: 'equal', reportedAt: baseline }], baseline).size, 0);
  assert.equal(gate.observe([fresh()], baseline).size, 1);
});
test('reloading or switching account starts an independent quiet baseline, with no private storage', () => {
  const first = new NewReportAlertGate(); first.observe([], baseline); first.observe([fresh()], baseline);
  const second = new NewReportAlertGate(); assert.equal(second.observe([fresh()], baseline).size, 0);
  assert.equal(second.observe([fresh('next')], baseline).size, 1);
});

test('nearby B stays quiet through acknowledgment, response start, reconnect and reappearance', () => {
  const gate = new NewReportAlertGate(); gate.observe([], baseline);
  assert.equal(gate.observe([{ ...fresh('B'), pendingNearbyReview: true }], baseline).size, 0);
  gate.observe([], baseline);
  for (const version of [2, 3, 4]) assert.equal(gate.observe([{ ...fresh('B'), pendingNearbyReview: false, version }], baseline).size, 0);
});

test('quiet B never suppresses a distinct normal new report A', () => {
  const gate = new NewReportAlertGate(); gate.observe([], baseline);
  const items = [{ ...fresh('B'), pendingNearbyReview: true }, fresh('A')];
  assert.deepEqual([...gate.observe(items, baseline)], ['A']);
  assert.deepEqual([...gate.observe(items, baseline)], []);
});
