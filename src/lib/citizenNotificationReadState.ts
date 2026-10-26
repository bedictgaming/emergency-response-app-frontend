const MAX_RECEIPTS = 250;
const receiptPattern = /^[a-f\d-]{36}@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i;
export const citizenNotificationReadKey = (userId: string) => `citizen-review-read:v1:${userId}`;
export function parseNotificationReceipts(raw: string | null): string[] {
  try { const rows: unknown = JSON.parse(raw ?? '[]'); return Array.isArray(rows) ? [...new Set(rows.filter((item): item is string => typeof item === 'string' && receiptPattern.test(item)))].slice(-MAX_RECEIPTS) : []; }
  catch { return []; }
}
export function addNotificationReceipt(rows: string[], receipt: string) {
  return receiptPattern.test(receipt) ? [...rows.filter(row => row !== receipt), receipt].slice(-MAX_RECEIPTS) : rows;
}
/** One bounded batch; callers persist once instead of racing per-item state. */
export function addNotificationReceipts(rows: string[], receipts: string[]) {
  return receipts.reduce((keys, receipt) => addNotificationReceipt(keys, receipt), rows);
}
