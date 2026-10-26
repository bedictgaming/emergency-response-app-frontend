import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import type { UserSafetyRecord } from '@/lib/services/userService';
test.use({ serviceWorkers: 'block' });
const citizenId = '10000000-0000-4000-8000-000000000001';
async function fixture(page: Page) {
  const main = { id: 'synthetic-main', name: 'Synthetic Main', role: 'ADMIN', department: 'MAIN', isMainAdmin: true, status: 'ACTIVE' };
  const state = { count: 2, inactive: false, failed: false, resetFailed: false, resets: [] as unknown[], peers: [] as WebSocketRoute[],
    events: [] as UserSafetyRecord['events'], reviewEvents: [] as NonNullable<UserSafetyRecord['reviewEvents']> };
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('emergency-response-theme', 'light');
    const streams: Stream[] = [];
    class Stream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); streams.push(this); setTimeout(() => this.onopen?.(), 0); }
      close() { this.closed = true; }
    }
    Object.assign(window, { EventSource: Stream, __safetyEmit: () => streams.filter(item => !item.closed).forEach(item => item.dispatchEvent(new Event('users.changed'))) });
  }, main);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    state.peers.push(peer); peer.onMessage(message => { if (message === '40') peer.send('40{"sid":"synthetic-safety"}'); });
    peer.send(`0${JSON.stringify({ sid: 'synthetic-engine', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1024 })}`);
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/password-reset')) { state.resets.push(route.request().postDataJSON()); return route.fulfill({ status: state.resetFailed ? 503 : 202, json: { message: 'Reset email accepted for delivery. Recovery is not yet confirmed.' } }); }
    if (path.endsWith('/violations')) return route.fulfill(state.failed ? { status: 503, json: { message: 'Synthetic unavailable' } } : { json: { data: {
      enabled: true, confirmedFalseCount: state.count, threshold: 3, events: state.events, reviewEvents: state.reviewEvents, recentReports: [{ incidentId: citizenId, ipAddress: '192.0.2.1',
        userAgent: '<script>not executable</script>', createdAt: '2026-10-20T00:00:00Z' }],
    } } });
    if (path.endsWith('/users/v1')) return route.fulfill({ json: { data: { users: [{ id: citizenId, name: 'Synthetic Citizen', email: 'synthetic@example.invalid', role: 'USER',
      status: state.inactive ? 'INACTIVE' : 'ACTIVE', createdAt: '2026-10-20T00:00:00Z' }] } } });
    return route.fulfill({ json: { data: { user: main, enabled: false, items: [], scope: 'MAIN', hasMore: false } } });
  });
  const emit = async () => {
    for (const peer of state.peers) peer.send(`42${JSON.stringify(['emergency.event', { type: 'users.changed' }])}`);
    await page.evaluate(() => (window as typeof window & { __safetyEmit: () => void }).__safetyEmit());
  };
  return { state, emit };
}
for (const width of [1280, 390]) test(`Main account safety is usable at ${width}px, with owner-only reset and live counts`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); const { state, emit } = await fixture(page);
  await page.goto('/admin/users'); const open = page.getByRole('button', { name: 'Account safety', exact: true }); await open.click();
  const panel = page.getByRole('region', { name: 'Account safety for Synthetic Citizen' });
  await expect(panel.getByText('2 / 3 distinct confirmed-false reports in the current cycle')).toBeVisible();
  await panel.getByText('Recent report request context (up to 20)', { exact: true }).click();
  await expect(panel.getByText('Browser-supplied user agent: <script>not executable</script>', { exact: true })).toBeVisible();
  await panel.screenshot({ path: info.outputPath(`account-safety-${width}.png`), animations: 'disabled' });
  await panel.getByRole('button', { name: 'Send password reset email' }).click();
  // Browser click completion precedes async HTTP interception under load.
  // Keep the exact one-request/empty-body assertion, wait for its receipt.
  await expect.poll(() => state.resets).toEqual([{}]);
  await expect(panel.getByRole('status')).toHaveText('Reset email accepted for delivery. Recovery is not yet confirmed.');
  state.count = 3; state.inactive = true; await emit();
  await expect(panel.getByText('3 / 3 distinct confirmed-false reports in the current cycle')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Send password reset email' })).toBeDisabled();
  await expect(panel.locator('details').filter({ hasText: 'Recent report request context (up to 20)' })).toHaveAttribute('open', '');
});
test('shows a retryable safety-read error and an honest reset delivery failure', async ({ page }) => {
  const { state } = await fixture(page); state.failed = true; await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Account safety', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Account safety for Synthetic Citizen' }); await expect(panel.getByRole('alert')).toContainText('could not load');
  state.failed = false; await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(panel.getByText('2 / 3 distinct confirmed-false reports in the current cycle')).toBeVisible();
  state.resetFailed = true; await panel.getByRole('button', { name: 'Send password reset email' }).click();
  await expect(panel.getByRole('status')).toContainText('No password was changed');
});

for (const width of [1280, 390]) test(`readable review actors and reasons at ${width}px, with retained audit history`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); const { state, emit } = await fixture(page);
  state.events = [{ auditLogId: 'synthetic-decision', action: 'CITIZEN_FALSE_REPORT_DECISION', createdAt: '2026-10-23T05:01:00Z',
    actor: { id: 'synthetic-main', name: 'Synthetic Main' }, metadata: { incidentId: citizenId, confirmed: true } }];
  state.reviewEvents = [
    { auditLogId: 'reviewed', incidentId: citizenId, action: 'INCIDENT_FLAG_REVIEWED', createdAt: '2026-10-23T05:01:00Z',
      actor: { id: 'synthetic-main', name: 'Synthetic Main' }, decision: 'CONFIRMED', department: 'FIRE', reason: 'Evidence reviewed. <script>plain text, never executable</script>' },
    { auditLogId: 'flagged', incidentId: citizenId, action: 'INCIDENT_FLAGGED', createdAt: '2026-10-23T05:00:00Z',
      actor: { id: 'synthetic-fire', name: 'Synthetic Fire Reviewer With A Long Display Name' }, decision: null, department: 'FIRE', reason: 'Synthetic investigation requested. '.repeat(6) },
    { auditLogId: 'legacy', incidentId: citizenId, action: 'INCIDENT_FLAG_CORRECTED', createdAt: '2026-10-22T05:00:00Z',
      actor: null, decision: 'DISMISSED', department: null, reason: null },
  ];
  await page.goto('/admin/users'); await page.getByRole('button', { name: 'Account safety', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Account safety for Synthetic Citizen' });
  await expect(panel).toContainText('This is not an IMEI/device ban');
  await panel.getByText('Recent sanction decisions (up to 20)', { exact: true }).click();
  await expect(panel).toContainText('Recorded actor: Synthetic Main · ID synthetic-main');
  const details = panel.locator('details').filter({ has: page.getByText('Recent report review actions (up to 20)', { exact: true }) });
  await details.locator('summary').click();
  const log = panel.getByRole('list', { name: 'Report review audit log' });
  await expect(log.getByRole('listitem')).toHaveCount(3);
  await expect(log.getByRole('listitem').first()).toContainText('False report confirmed · FIRE');
  await expect(log).toContainText('1:01 PM (Asia/Manila)');
  await expect(log).toContainText('Reason / review notes: Evidence reviewed. <script>plain text, never executable</script>');
  await expect(log.locator('script')).toHaveCount(0);
  await expect(log).toContainText('Actor not available in the retained record'); await expect(log).toContainText('Reason / review notes: Not recorded');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await details.screenshot({ path: info.outputPath(`review-audit-${width}.png`) });
  state.reviewEvents = []; await emit();
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('This does not mean the account has no historical violations');
  await expect(panel).toContainText('2 / 3 distinct confirmed-false reports');
});

test('a cross-account storage change discards loaded review history', async ({ page }) => {
  const { state } = await fixture(page);
  state.reviewEvents = [{ auditLogId: 'private-history', incidentId: citizenId, action: 'INCIDENT_FLAGGED', createdAt: '2026-10-23T05:00:00Z',
    actor: { id: 'synthetic-fire', name: 'Synthetic Private Reviewer' }, reason: 'Private synthetic review explanation', decision: null, department: 'FIRE' }];
  await page.goto('/admin/users'); await page.getByRole('button', { name: 'Account safety', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Account safety for Synthetic Citizen' });
  await panel.getByText('Recent report review actions (up to 20)', { exact: true }).click();
  await expect(panel).toContainText('Private synthetic review explanation');
  await page.evaluate(() => { localStorage.setItem('user', JSON.stringify({ id: 'different-main', role: 'ADMIN', department: 'MAIN' })); window.dispatchEvent(new StorageEvent('storage')); });
  await expect(panel.getByRole('alert')).toContainText('Account changed');
  await expect(page.getByText('Private synthetic review explanation', { exact: false })).toHaveCount(0);
});
