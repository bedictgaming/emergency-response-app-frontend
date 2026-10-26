import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addNotificationReceipt, addNotificationReceipts, citizenNotificationReadKey, parseNotificationReceipts } from '../src/lib/citizenNotificationReadState.ts';
const receipt = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}@2026-10-23T00:00:00.000Z`;
test('invalid storage does not invent read notifications', () => {
  for (const raw of [null, 'not json', '{}', 'null', '[null,2,"wrong"]']) assert.deepEqual(parseNotificationReceipts(raw), []);
});
test('read receipts are versioned and account-scoped, without report text', () => {
  assert.notEqual(citizenNotificationReadKey('one'), citizenNotificationReadKey('two'));
  const first = receipt(1), next = first.replace('00:00:00.000Z', '00:01:00.000Z');
  assert.deepEqual(addNotificationReceipt([first], first), [first]);
  assert.deepEqual(addNotificationReceipt([first], next), [first, next]);
  assert.deepEqual(addNotificationReceipt([first], 'private report text'), [first]);
});
test('receipt storage is bounded, unique and preserves the latest read actions', () => {
  const rows = Array.from({ length: 300 }, (_, n) => receipt(n));
  const parsed = parseNotificationReceipts(JSON.stringify([...rows, rows[299]]));
  assert.equal(parsed.length, 250); assert.equal(parsed[0], rows[50]);
  const added = addNotificationReceipt(parsed, receipt(301));
  assert.equal(added.length, 250); assert.equal(added.at(-1), receipt(301));
});

test('mark-all collects every displayed version in one immutable, unique batch', () => {
  const previous = [receipt(1)], copies = [...previous];
  const marked = addNotificationReceipts(previous, [receipt(1), receipt(2), receipt(3), receipt(2), 'not a receipt']);
  assert.deepEqual(marked, [receipt(1), receipt(3), receipt(2)]); assert.deepEqual(previous, copies);
});

test('mark-all retains the250 receipt limit and cannot silently read a later version', () => {
  const previous = Array.from({ length: 250 }, (_, n) => receipt(n));
  const batch = Array.from({ length: 50 }, (_, n) => receipt(n + 250));
  const marked = addNotificationReceipts(previous, batch);
  assert.equal(marked.length, 250); assert.deepEqual(marked.slice(-50), batch);
  assert.ok(!marked.includes(batch[0].replace('00:00:00.000Z', '00:01:00.000Z')));
});
