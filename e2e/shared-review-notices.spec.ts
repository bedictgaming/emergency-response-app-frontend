import { expect, test, type Page } from '@playwright/test';
import type { IncidentReviewNotice } from '../src/lib/services/incidentService';

const incidentId = '10000000-0000-4000-8000-000000000001';
const flagId = '20000000-0000-4000-8000-000000000002';
const version = '2026-10-13T00:00:00.000Z';
const reason = 'Synthetic DRRMO operator contacted the reporter to investigate this report.';
const explanation = 'Synthetic Main Admin checked the facts and recorded the review outcome.';
type Department = 'FIRE' | 'MEDICAL' | 'POLICE' | 'DRRMO';
const notice = (status: IncidentReviewNotice['status'], revision = 0): IncidentReviewNotice => ({
  reviewFlagId: flagId, department: 'DRRMO', status, reason, reviewNotes: status === 'PENDING' ? null : explanation,
  createdAt: version, updatedAt: `2026-10-13T00:0${revision}:00.000Z`,
});

async function fixture(page: Page, department: Department, initial: IncidentReviewNotice[] | undefined = [notice('PENDING')]) {
  const user = { id: `synthetic-${department}`, name: 'Synthetic department admin', role: 'ADMIN', department, isMainAdmin: false, status: 'ACTIVE' };
  await page.addInitScript(value => {
    localStorage.setItem('user', JSON.stringify(value));
    class Stream extends EventTarget {
      static all: Stream[] = []; onopen: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor() { super(); Stream.all.push(this); setTimeout(() => this.onopen?.(), 5); }
      close() {}
    }
    Object.assign(window, { EventSource: Stream, __reviewStreams: Stream.all });
  }, user);
  let notices: IncidentReviewNotice[] | undefined = initial;
  let detailNotices: IncidentReviewNotice[] | undefined, failed = false, lists = 0;
  const writes: string[] = [];
  const report = (detail = false) => {
    const items = detail && detailNotices ? detailNotices : notices;
    return {
      incidentId, title: 'OTHER Emergency: Synthetic shared review — no emergency', description: 'Synthetic test only.',
      status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'],
      reportedAt: version, updatedAt: version, reportedBy: 'synthetic-citizen',
      type: { typeName: 'OTHER' }, location: { locationName: 'Synthetic test location' }, reporter: { name: 'Synthetic Citizen' },
      attachments: [], incidentUnits: [], tasks: [],
      serviceResponses: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'].map(service => ({ service, status: 'RESPONDING' })),
      reviewNotices: items,
      reviewFlags: items?.filter(item => item.department === department && item.status !== 'DISMISSED').map(item => ({ ...item, incidentId })) ?? [],
    };
  };
  await page.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') writes.push(`${req.method()} ${path}`);
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/incidents/v1/attention')) return route.fulfill({ json: { data: { items: [], hasMore: false, scope: department } } });
    if (path.includes('/incidents/v1/')) {
      const detail = path.endsWith(incidentId);
      if (!detail) lists++;
      if (failed && !detail) return route.fulfill({ status: 503, json: { message: 'Synthetic temporary outage' } });
      return route.fulfill({ json: { data: { incidents: [report()], incident: report(detail),
        pagination: { page: 1, limit: 5, total: 1, pages: 1 }, summary: { total: 1, active: 0, responding: 1, resolved: 0 } } } });
    }
    return route.fulfill({ json: { data: { alerts: [], items: [], units: [], users: [] } } });
  });
  await page.goto(`/admin/${({ FIRE: 'fire', MEDICAL: 'medical', POLICE: 'police', DRRMO: 'drrmo' })[department]}-dashboard`);
  await expect(page.getByRole('button', { name: 'Flag suspected false report' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __reviewStreams: unknown[] }).__reviewStreams.length)).toBe(1);
  return { set: (next: IncidentReviewNotice[] | undefined) => { notices = next; },
    detail: (next: IncidentReviewNotice[]) => { detailNotices = next; },
    fail: (value: boolean) => { failed = value; }, reads: () => lists, writes };
}
async function liveUpdate(page: Page) {
  await page.evaluate(() => {
    const streams = (window as unknown as { __reviewStreams: EventTarget[] }).__reviewStreams;
    streams[0].dispatchEvent(new MessageEvent('incident.updated', { data: JSON.stringify({ entityId: 'synthetic', type: 'incident.updated' }) }));
  });
}

for (const width of [1280, 390]) for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO'] as const) {
  test(`${department} sees shared pending, confirmed and corrected decisions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const state = await fixture(page, department);
    const card = page.getByRole('region', { name: 'Shared report review' });
    await expect(card).toContainText('Flagged by DRRMO — awaiting Main Admin review');
    await expect(card).toContainText('Suspicion is not a decision');
    await card.getByText('View review details (1)', { exact: true }).click();
    await expect(card).toContainText(reason);
    await expect(card).toContainText('(Manila)');
    const summary = card.locator('summary');
    expect(await summary.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await card.locator('li p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    if (department === 'FIRE') await page.screenshot({ path: test.info().outputPath(`shared-review-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Flag suspected false report' }).click();
    const dialog = page.getByRole('dialog'), shared = dialog.getByRole('region', { name: 'Shared report review' });
    await expect(shared).toContainText('awaiting Main Admin review');
    if (department !== 'DRRMO') await expect(dialog.getByLabel('Why do you suspect this report is false?')).toBeVisible();
    state.set([notice('CONFIRMED', 1)]); await liveUpdate(page);
    await expect(shared).toContainText('Confirmed false by Main Admin — flagged by DRRMO');
    await expect(shared).toContainText('does not close any response');
    await shared.getByText('View review details (1)', { exact: true }).click();
    await expect(shared).toContainText(explanation);
    await expect(dialog).toContainText('Current status: RESPONDING');
    await expect(dialog.getByRole('button', { name: /Confirm false report|Dismiss suspicion|Correct mistaken|Delete closed/ })).toHaveCount(0);
    state.set([notice('DISMISSED', 2)]); await liveUpdate(page);
    await expect(shared).toContainText('Flag from DRRMO dismissed by Main Admin');
    await expect(shared).toContainText(explanation);
    await expect(dialog).toContainText('Current status: RESPONDING');
    await expect(dialog.getByText('The main admin confirmed this report as false.', { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('Why do you suspect this report is false?')).toBeVisible();
    expect(state.writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('a newer detail decision is not undone by an older list refresh', async ({ page }) => {
  const state = await fixture(page, 'FIRE');
  state.detail([notice('CONFIRMED', 2)]);
  await page.getByRole('button', { name: 'Flag suspected false report' }).click();
  const shared = page.getByRole('dialog').getByRole('region', { name: 'Shared report review' });
  await expect(shared).toContainText('Confirmed false by Main Admin');
  const reads = state.reads(); await liveUpdate(page);
  await expect.poll(state.reads).toBeGreaterThan(reads);
  await expect(shared).toContainText('Confirmed false by Main Admin');
  state.set([notice('DISMISSED', 3)]); await liveUpdate(page);
  await expect(shared).toContainText('dismissed by Main Admin');
  expect(state.writes).toEqual([]);
});

test('one dismissed flag cannot hide another confirmation, and long notes remain readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const longReason = '🚩' + 'x'.repeat(475) + ' اختبار';
  await fixture(page, 'FIRE', [notice('DISMISSED', 3), { ...notice('CONFIRMED', 2), reviewFlagId: 'other-flag', department: 'MEDICAL', reason: longReason }]);
  const shared = page.getByRole('region', { name: 'Shared report review' });
  await expect(shared).toContainText('Main Admin confirmed a false report');
  await expect(shared).toContainText('DRRMO, Medical');
  const summary = shared.locator('summary'); await summary.focus(); await page.keyboard.press('Enter');
  await expect(shared).toContainText(longReason);
  await expect(shared.getByText('False-report flags dismissed by Main Admin', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('an unavailable refresh does not clear a confirmed review or close response work', async ({ page }) => {
  const state = await fixture(page, 'FIRE', [notice('CONFIRMED', 1)]);
  state.fail(true); const reads = state.reads(); await liveUpdate(page);
  await expect.poll(state.reads).toBeGreaterThan(reads);
  await expect(page.getByRole('region', { name: 'Shared report review' })).toContainText('Confirmed false by Main Admin');
  await expect(page.getByRole('button', { name: 'Mark as Resolved' })).toBeVisible();
  expect(state.writes).toEqual([]);
});

for (const empty of [undefined, []]) test(`missing/empty notices do not invent an all-clear (${empty ? 'empty' : 'legacy'})`, async ({ page }) => {
  const state = await fixture(page, 'FIRE', []); state.set(empty); await liveUpdate(page);
  await expect(page.getByRole('region', { name: 'Shared report review' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Flag suspected false report' })).toBeVisible();
});
