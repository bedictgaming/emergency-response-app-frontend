import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

// Actual browser Socket.IO client; synthetic Engine.IO peer/API, not live acceptance.
test.skip(process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT !== 'socket.io', 'Requires a separate Socket.IO export');

async function setup(page: Page) {
  let attention = 0, revoked = false;
  const peers: WebSocketRoute[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'fire-admin', role: 'ADMIN', department: 'FIRE' }));
    // Socket.IO must work without relying on native EventSource.
    Object.defineProperty(window, 'EventSource', { value: undefined });
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/refresh-token') || (revoked && path.endsWith('/auth/v1/me'))) {
      return route.fulfill({ status: 401, json: { code: 401, status: 'error', message: 'Session expired' } });
    }
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user: {
      id: 'fire-admin', name: 'Synthetic Fire Admin', role: 'ADMIN', status: 'ACTIVE', department: 'FIRE', isMainAdmin: false,
    } } } });
    if (path.endsWith('/attention')) attention++;
    return route.fulfill({ json: { data: { items: [], hasMore: false, scope: 'FIRE', incidents: [],
      users: [], units: [], alerts: [], types: [], barangays: [],
      pagination: { page: 1, total: 0, totalPages: 1 },
      serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 },
      verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 },
    } } });
  });
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peers.push(peer);
    peer.onMessage(message => {
      if (message === '40') peer.send('40{"sid":"synthetic-namespace"}');
      if (message === '3') return; // Engine.IO heartbeat response.
    });
    peer.send(`0${JSON.stringify({ sid: `synthetic-${peers.length}`, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1024 })}`);
  });
  await page.goto('/admin/fire-dashboard');
  await expect(page.getByRole('heading', { name: 'Fire Emergency Dashboard', exact: true, level: 1 })).toBeVisible();
  await expect.poll(() => peers.length).toBe(1);
  await expect(page.getByText('Live connection · queue checked every 20s', { exact: true })).toBeVisible();
  return { peers, reads: () => attention, revoke: () => { revoked = true; } };
}

test('Socket.IO invalidates authoritative data and shares one connection without EventSource', async ({ page }) => {
  const state = await setup(page);
  const reads = state.reads();
  state.peers[0].send(`42${JSON.stringify(['emergency.event', {
    type: 'incident.updated', entityId: 'synthetic', occurredAt: '2026-10-17T00:00:00Z',
    // Even a synthetic extra body must never create an authoritative report.
    title: 'Untrusted event body', status: 'RESPONDING',
  }])}`);
  await expect.poll(state.reads).toBeGreaterThan(reads);
  expect(state.peers).toHaveLength(1);
  await expect(page.getByText('Untrusted event body', { exact: true })).toHaveCount(0);
});

test('Socket.IO freeze/resume reconnects once and performs catch-up', async ({ page }) => {
  const state = await setup(page);
  const reads = state.reads();
  await page.evaluate(() => document.dispatchEvent(new Event('freeze')));
  await page.evaluate(() => {
    document.dispatchEvent(new Event('resume'));
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('online'));
  });
  await expect.poll(() => state.peers.length).toBe(2);
  await expect.poll(state.reads).toBeGreaterThan(reads);
  await expect(page.getByText('Live connection · queue checked every 20s', { exact: true })).toBeVisible();
});

test('Socket.IO failure with a revoked session stops reconnecting', async ({ page }) => {
  const state = await setup(page);
  state.revoke(); state.peers[0].close();
  await expect(page).toHaveURL('/');
  await page.waitForTimeout(2500);
  expect(state.peers).toHaveLength(1);
});
