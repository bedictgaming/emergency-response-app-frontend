import { jsPDF } from 'jspdf';
import { autoTable, type Table, type UserOptions } from 'jspdf-autotable';
import type { DashboardAnalytics, IncidentRecord, ResolvedSummaryItem } from '@/types/barangay-history';
import { historyPdfText } from './historyPdfExport';

export type HistoryPdfModel = {
  incidents: IncidentRecord[];
  analytics: DashboardAnalytics;
  monthly: ResolvedSummaryItem;
  generatedAt: Date;
  filters: [string, string][];
  scope: string;
  font: Uint8Array;
};
const number = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : 'Unavailable';
const date = (value: string | Date) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
  }).format(parsed) : 'Date unavailable';
};

/** Text/table PDF only: no HTML execution, external images, photo URLs or print dialog. */
export function buildIncidentHistoryPdf(model: HistoryPdfModel): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  let binary = '';
  for (let i = 0; i < model.font.length; i += 8192) binary += String.fromCharCode(...model.font.subarray(i, i + 8192));
  doc.addFileToVFS('DejaVuSans.ttf', btoa(binary));
  doc.addFont('DejaVuSans.ttf', 'ReportSans', 'normal');
  doc.setFont('ReportSans', 'normal');
  const metadata = doc.getFont().metadata as { characterToGlyph?: (code: number) => number };
  if (!metadata.characterToGlyph) throw Error('PDF_FONT_UNAVAILABLE');
  // jsPDF's Unicode writer consumes UTF-16 code units. Preserve unsupported
  // characters explicitly as code-point labels instead of silently losing them.
  const text = (value: unknown, fallback?: string) => [...historyPdfText(value, fallback)].map(char => {
    const code = char.codePointAt(0)!;
    return char === '\n' || char === '\r' || char === '\t' || (code <= 0xffff && metadata.characterToGlyph!(code))
      ? char : `[U+${code.toString(16).toUpperCase()}]`;
  }).join('');
  doc.setProperties({ title: 'Barangay incident history and analytics', author: 'Cordova Emergency Response - capstone demo',
    subject: 'Authorized administrative export; not a locked historical snapshot' });
  doc.setCreationDate(model.generatedAt);
  const margin = 12, width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const contentWidth = width - margin * 2;
  const base: UserOptions = {
    margin: { left: margin, right: margin, top: 28, bottom: 17 }, theme: 'striped',
    styles: { font: 'ReportSans', fontStyle: 'normal', fontSize: 8, cellPadding: 2, overflow: 'linebreak', textColor: [30, 35, 42] },
    headStyles: { font: 'helvetica', fontStyle: 'bold', fillColor: [30, 35, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [247, 248, 249] }, showHead: 'everyPage', rowPageBreak: 'avoid',
  };
  const table = (options: UserOptions) => {
    autoTable(doc, { ...base, ...options });
    const y = (doc as jsPDF & { lastAutoTable: Table }).lastAutoTable.finalY;
    if (typeof y !== 'number') throw Error('PDF_TABLE_UNAVAILABLE');
    return y;
  };
  const heading = (label: string, y: number, x = margin) => {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(180, 0, 0).text(label, x, y);
  };

  let y = table({ startY: 29, theme: 'plain', columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: contentWidth - 35 } },
    body: [['Export scope', text(model.scope)], ['Report selection', 'All matching records; newest submitted reports first'],
      ...model.filters.map(([key, value]) => [text(key), text(value)]),
      ['Filtered records', String(model.incidents.length)],
      ['Submission cutoff', `${date(model.generatedAt)} (export-device time)`]],
  }) + 7;
  if (y > height - 70) { doc.addPage(); y = 32; }
  heading('Verified analytics - independent of the record-list filters', y);
  const monthly = model.monthly;
  y = table({ startY: y + 3, head: [['Summary scope', 'Reported', 'Currently resolved / closed', 'Resolution rate']],
    body: [
      ['All-time verified reports', number(model.analytics.resolvedSummary?.totalHistorical), number(model.analytics.resolvedSummary?.totalResolvedAllTime),
        typeof model.analytics.resolvedSummary?.totalHistorical === 'number' && model.analytics.resolvedSummary.totalHistorical > 0
          ? `${Math.round(model.analytics.resolvedSummary.totalResolvedAllTime / model.analytics.resolvedSummary.totalHistorical * 100)}%` : '0%'],
      [`Selected report month: ${monthly.year}-${String(monthly.month).padStart(2, '0')} (Asia/Manila)`, number(monthly.totalReportedThisMonth), number(monthly.resolvedThisMonth),
        `${monthly.totalReportedThisMonth ? Math.round(monthly.resolvedThisMonth / monthly.totalReportedThisMonth * 100) : 0}%`],
    ],
  }) + 5;
  doc.setFont('ReportSans', 'normal').setFontSize(7.5).setTextColor(70, 75, 85);
  const note = doc.splitTextToSize('Rankings cover all-time verified reports in your authorized scope. Unverified, rejected, cancelled and confirmed-false reports are excluded. The monthly summary groups reports by reporting month, not resolution month.', contentWidth);
  doc.text(note, margin, y); y += note.length * 3.6 + 7;
  if (y > height - 65) { doc.addPage(); y = 32; }
  const summaryPage = doc.getCurrentPageInfo().pageNumber, leftWidth = (contentWidth - 10) / 2, rightX = margin + leftWidth + 10;
  heading('Barangay ranking - all-time verified', y);
  table({ startY: y + 3, tableWidth: leftWidth, margin: { left: margin, right: width - margin - leftWidth, top: 28, bottom: 17 },
    head: [['Barangay', 'Reports', 'Share']], body: model.analytics.incidentsByBarangay.rankings.length
      ? model.analytics.incidentsByBarangay.rankings.map(r => [text(r.name), number(r.incidentCount), `${text(r.percentage)}%`])
      : [['No ranking data', '-', '-']],
  });
  doc.setPage(summaryPage); heading('Emergency categories - all-time verified', y, rightX);
  table({ startY: y + 3, tableWidth: leftWidth, margin: { left: rightX, right: margin, top: 28, bottom: 17 },
    head: [['Category', 'Reports', 'Share']], body: model.analytics.incidentsByType.distribution.length
      ? model.analytics.incidentsByType.distribution.map(r => [text(r.typeName), number(r.count), `${text(r.percentage)}%`])
      : [['No category data', '-', '-']],
  });
  doc.setPage(doc.getNumberOfPages()); doc.addPage(); heading('Filtered incident history', 31);
  doc.setFont('ReportSans', 'normal').setFontSize(8).setTextColor(65, 70, 80);
  doc.text(`${model.incidents.length} matching records. All authorized record statuses are retained; these are not the verified-analytics totals.`, margin, 37);
  if (!model.incidents.length) doc.text('No incident records match the selected filters.', margin, 47);
  else table({ startY: 42, head: [['Reported (Manila)', 'Barangay', 'Incident / description', 'Category', 'Severity', 'Status', 'Reporter']],
    columnStyles: { 0: { cellWidth: 31 }, 1: { cellWidth: 28 }, 2: { cellWidth: 76 }, 3: { cellWidth: 32 }, 4: { cellWidth: 18 }, 5: { cellWidth: 24 }, 6: { cellWidth: contentWidth - 209 } },
    body: model.incidents.map((r, index) => [date(r.reportedAt), text(r.barangay?.name, 'Barangay unavailable'),
      `${index + 1}. ${text(r.title)}\n${text(r.description, 'No description provided.')}\nVerification: ${text(r.verificationStatus, 'Unavailable')}`,
      text(r.type?.typeName), text(r.severityLevel), text(r.status),
      [text(r.reporter?.name, 'Name unavailable'), text(r.reporter?.email, 'Email unavailable')].join('\n')]),
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(75, 80, 90);
    doc.text('Cordova Emergency Response | Capstone demo', margin, 10);
    doc.text(`Generated: ${date(model.generatedAt)}`, width - margin, 10, { align: 'right' });
    doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(25, 30, 38).text('Barangay Incident History & Analytics', margin, 19);
    doc.setDrawColor(205, 0, 0).setLineWidth(0.5).line(margin, 23, width - margin, 23);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(80, 85, 95);
    doc.text('Authorized data; not a locked snapshot. Unsupported characters appear as [U+code].', margin, height - 8);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 8, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
