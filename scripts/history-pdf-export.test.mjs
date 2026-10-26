import test from 'node:test';
import assert from 'node:assert/strict';
import { collectHistoryPdfRecords, historyPdfText } from '../src/lib/historyPdfExport.ts';

const rows = count => Array.from({ length: count }, (_, i) => ({ incidentId: String(count - i).padStart(5, '0'), reportedAt: new Date(1_780_000_000_000 - i * 1000).toISOString() }));
const page = (records, n, extra = {}) => ({ incidents: records.slice((n - 1) * 100, n * 100), pagination: { page: n, limit: 100, total: records.length, pages: Math.ceil(records.length / 100), ...extra } });
for (const count of [0, 1, 100, 107, 1000]) test(`collect all ${count}, retaining order and verifying first page`, async () => {
  const source = rows(count), calls = [];
  const got = await collectHistoryPdfRecords(async n => { calls.push(n); return page(source, n); }, () => {});
  assert.deepEqual(got, source); assert.equal(calls.at(-1), 1); assert.equal(calls.length, Math.max(1, Math.ceil(count / 100)) + 1);
});
test('reject over limit without walking remaining pages', async () => {
  let calls = 0;
  await assert.rejects(collectHistoryPdfRecords(async n => { calls++; return page(rows(1001), n); }, () => {}), { code: 'limit' });
  assert.equal(calls, 1);
});
test('reject malformed metadata and incomplete rows', async () => {
  for (const extra of [{ limit: 5 }, { pages: 9 }, { page: 2 }, { total: -1 }, { total: 3 }]) {
    await assert.rejects(collectHistoryPdfRecords(async n => page(rows(2), n, extra), () => {}), { code: 'invalid' });
  }
});
test('reject duplicate membership, ascending order, changed total, or changed reread', async () => {
  const source = rows(107);
  const duplicate = [...source]; duplicate[101] = source[0];
  const ascending = [...source].reverse();
  for (const data of [duplicate, ascending]) await assert.rejects(collectHistoryPdfRecords(async n => page(data, n), () => {}), { code: 'changed' });
  await assert.rejects(collectHistoryPdfRecords(async n => page(n === 1 ? source : rows(108), n), () => {}), { code: 'changed' });
  let firstReads = 0;
  await assert.rejects(collectHistoryPdfRecords(async n => {
    const result = page(source, n);
    if (n === 1 && ++firstReads > 1) result.incidents = result.incidents.map(r => ({ ...r, title: 'Updated' }));
    return result;
  }, () => {}), { code: 'changed' });
});
test('current-session assertion checked after asynchronous reads', async () => {
  let current = true;
  await assert.rejects(collectHistoryPdfRecords(async n => { current = false; return page(rows(1), n); }, () => { if (!current) throw Error('cancelled'); }), /cancelled/);
});
test('plain text preserves accents, strips bidi/control characters, never parses HTML', () => {
  assert.equal(historyPdfText('  Niño\u202E\u0001\n<script>text</script> '), 'Niño\n<script>text</script>');
  assert.equal(historyPdfText(null), 'Unavailable');
});
