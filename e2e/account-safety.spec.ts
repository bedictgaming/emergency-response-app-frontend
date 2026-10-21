import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
const citizenId = '10000000-0000-4000-8000-000000000001';
async function fixture(page: Page) {
  const main = { id: 'synthetic-main', name: 'Synthetic Main', role: 'ADMIN', department: 'MAIN', isMainAdmin: true, status: 'ACTIVE' };
  const state = { count: 2, inactive: false, failed: false, resetFailed: false, resets: [] as unknown[], peers: [] as WebSocketRoute[] };
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
      enabled: true, confirmedFalseCount: state.count, threshold: 3, events: [], recentReports: [{ incidentId: citizenId, ipAddress: '192.0.2.1',
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
