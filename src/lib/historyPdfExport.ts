export const HISTORY_PDF_BATCH_SIZE = 100;
export const HISTORY_PDF_MAX_RECORDS = 1000;

export class HistoryPdfExportError extends Error {
  code: 'changed' | 'limit' | 'invalid';
  constructor(code: HistoryPdfExportError['code']) { super(code); this.code = code; }
}
type OrderedRecord = { incidentId: string; reportedAt: string };
type ExportPage<T> = { incidents: T[]; pagination: { page: number; limit: number; total: number; pages: number } };

/** Read only, bounded, server-ordered pages; never emit a silently partial PDF. */
export async function collectHistoryPdfRecords<T extends OrderedRecord>(
  readPage: (page: number) => Promise<ExportPage<T>>,
  assertCurrent: () => void,
): Promise<T[]> {
  const read = async (page: number) => {
    assertCurrent(); const result = await readPage(page); assertCurrent();
    const p = result?.pagination;
    if (!Array.isArray(result?.incidents) || !p || p.page !== page || p.limit !== HISTORY_PDF_BATCH_SIZE
      || !Number.isSafeInteger(p.total) || p.total < 0 || !Number.isSafeInteger(p.pages)
      || p.pages !== Math.ceil(p.total / p.limit)
      || result.incidents.length !== Math.min(p.limit, Math.max(0, p.total - (page - 1) * p.limit))) {
      throw new HistoryPdfExportError('invalid');
    }
    if (p.total > HISTORY_PDF_MAX_RECORDS) throw new HistoryPdfExportError('limit');
    return result;
  };
  const first = await read(1), rows = [...first.incidents];
  for (let page = 2; page <= first.pagination.pages; page++) {
    const next = await read(page);
    if (next.pagination.total !== first.pagination.total) throw new HistoryPdfExportError('changed');
    rows.push(...next.incidents);
  }
  const ids = new Set<string>();
  let previous: T | undefined;
  for (const row of rows) {
    if (typeof row.incidentId !== 'string' || !row.incidentId || ids.has(row.incidentId)
      || !Number.isFinite(Date.parse(row.reportedAt))) throw new HistoryPdfExportError('changed');
    if (previous && (Date.parse(previous.reportedAt) < Date.parse(row.reportedAt)
      || (Date.parse(previous.reportedAt) === Date.parse(row.reportedAt) && previous.incidentId < row.incidentId))) {
      throw new HistoryPdfExportError('changed');
    }
    ids.add(row.incidentId); previous = row;
  }
  // Detect membership/first-page drift while collecting offset-based pages.
  // This is deliberately not presented as a locked database snapshot.
  const verified = await read(1);
  if (verified.pagination.total !== first.pagination.total
    || JSON.stringify(verified.incidents) !== JSON.stringify(first.incidents)) throw new HistoryPdfExportError('changed');
  return rows;
}

export function historyPdfText(value: unknown, fallback = 'Unavailable'): string {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const text = String(value).normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return text || fallback;
}
