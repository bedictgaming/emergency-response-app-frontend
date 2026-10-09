import { expect, test, type BrowserContext } from '@playwright/test';

const citizen = { id: 'citizen', role: 'USER', name: 'Citizen', email: 'citizen@example.test', permissions: [] };
const admin = { id: 'admin', role: 'ADMIN', name: 'Test Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true, permissions: [] };
const site = 'http://127.0.0.1:3100';

async function setHint(context: BrowserContext, value = String(Date.now() - 1_000)) {
  await context.addCookies([{ name: 'sessionRenewAt', value, url: site }]);
}

async function authorize(context: BrowserContext, user = citizen, check?: () => void) {
  await context.route('**/api/auth/v1/me', route => {
    check?.();
    return route.fulfill({ json: { data: { user } } });
  });
  await context.route('**/api/incidents/v1/**', route => {
    check?.();
    return route.fulfill({ json: { data: { incidents: [], flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
  });
  await context.route('**/api/events/v1/stream', route => {
    check?.();
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n' });
  });
}

for (const [role, user, path, heading] of [
  ['citizen', citizen, '/dashboard', 'Choose emergency type'],
  ['admin', admin, '/admin/main-dashboard', 'Main Admin Dashboard'],
] as const) {
  test(`${role} renews before protected reads and SSE without first receiving an expiry 401`, async ({ page, context }) => {
    await setHint(context);
    let refreshes = 0;
    let reads = 0;
    let prematureReads = 0;
    await authorize(context, user, () => {
      reads += 1;
      if (refreshes === 0) prematureReads += 1;
    });
    await context.route('**/api/auth/v1/refresh-token', async route => {
      refreshes += 1;
      await setHint(context, String(Date.now() + 780_000));
      await route.fulfill({ json: { data: { user } } });
    });
    await page.goto(path);
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
    await expect.poll(() => reads).toBeGreaterThan(2);
    expect(prematureReads).toBe(0);
    expect(refreshes).toBe(1);
    expect(await page.evaluate(() => [localStorage.getItem('accessToken'), localStorage.getItem('refreshToken')])).toEqual([null, null]);
  });
}

test('two tabs share one proactive renewal under the browser session lock', async ({ page, context }) => {
  let refreshes = 0;
  await authorize(context);
  await context.route('**/api/auth/v1/refresh-token', async route => {
    refreshes += 1;
    await new Promise(resolve => setTimeout(resolve, 200));
    await setHint(context, String(Date.now() + 780_000));
    await route.fulfill({ json: { data: { user: citizen } } });
  });
  await setHint(context);
  const second = await context.newPage();
  await Promise.all([page.goto('/dashboard'), second.goto('/dashboard')]);
  await expect(page.getByText('Choose emergency type')).toBeVisible();
  await expect(second.getByText('Choose emergency type')).toBeVisible();
  expect(refreshes).toBe(1);
  // Drain asynchronous mock handlers before Playwright destroys the context.
  await Promise.all([page.close(), second.close()]);
  await context.unrouteAll({ behavior: 'wait' });
});

test('returning to an idle admin tab renews before its next profile check', async ({ page, context }) => {
  let refreshes = 0;
  let expired = false;
  let prematureReads = 0;
  await authorize(context, admin);
  await context.route('**/api/auth/v1/me', route => {
    if (expired && refreshes === 0) prematureReads += 1;
    return route.fulfill({ json: { data: { user: admin } } });
  });
  await context.route('**/api/auth/v1/refresh-token', async route => {
    refreshes += 1;
    await setHint(context, String(Date.now() + 780_000));
    await route.fulfill({ json: { data: { user: admin } } });
  });
  await setHint(context, String(Date.now() + 780_000));
  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
  await expect(page.getByText('No pending or confirmed review flags.')).toBeVisible();
  await setHint(context);
  expired = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => refreshes).toBe(1);
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
  expect(prematureReads).toBe(0);
});

test('a proactive renewal outage preserves the session and can recover on retry', async ({ page, context }) => {
  let unavailable = true;
  await page.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), admin);
  await setHint(context);
  await authorize(context, admin);
  await context.route('**/api/auth/v1/refresh-token', async route => {
    if (unavailable) return route.fulfill({ status: 503, json: { code: 503, message: 'Temporarily unavailable' } });
    await setHint(context, String(Date.now() + 780_000));
    return route.fulfill({ json: { data: { user: admin } } });
  });
  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Authorization service is temporarily unavailable.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user')!).id)).toBe('admin');
  await expect(page).toHaveURL(/\/admin\/main-dashboard$/);
  unavailable = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
});

test('a revoked proactive renewal never opens protected reads or an event stream', async ({ page, context }) => {
  let reads = 0;
  let refreshes = 0;
  await setHint(context);
  await authorize(context, citizen, () => { reads += 1; });
  await context.route('**/api/auth/v1/refresh-token', route => {
    refreshes += 1;
    return route.fulfill({ status: 401, json: { code: 401, message: 'Session revoked' } });
  });
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/');
  expect(refreshes).toBe(1);
  expect(reads).toBe(0);
});

test('an unchanged hint does not cause repeated rotation when its update is unavailable', async ({ page, context }) => {
  let refreshes = 0;
  await setHint(context);
  await authorize(context, admin);
  await context.route('**/api/auth/v1/refresh-token', route => {
    refreshes += 1;
    return route.fulfill({ json: { data: { user: admin } } });
  });
  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(300);
  expect(refreshes).toBe(1);
});

test('logout during proactive renewal cannot publish a new session generation or dashboard', async ({ page, context }) => {
  let started!: () => void;
  let release!: () => void;
  const seen = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await setHint(context);
  await authorize(context, admin, () => { reads += 1; });
  await context.route('**/api/auth/v1/refresh-token', async route => {
    started();
    await held;
    await route.fulfill({ json: { data: { user: admin } } });
  });
  await page.goto('/admin/main-dashboard');
  await seen;
  await page.evaluate(() => {
    // Mirror the complete local logout contract, including the scheduling hint.
    localStorage.removeItem('user');
    document.cookie = 'sessionRenewAt=; Max-Age=0; Path=/';
    localStorage.removeItem('emergency-session-generation');
    const epoch = crypto.randomUUID();
    localStorage.setItem('emergency-logout-epoch', epoch);
    window.dispatchEvent(new StorageEvent('storage', { key: 'emergency-logout-epoch', newValue: epoch }));
  });
  release();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => localStorage.getItem('emergency-session-generation'))).toBeNull();
  expect(reads).toBe(0);
});

test('public advisory reads do not renew a session merely because a hint is present', async ({ page, context }) => {
  let refreshes = 0;
  let advisories = 0;
  await setHint(context);
  await context.route('**/api/auth/v1/refresh-token', route => {
    refreshes += 1;
    return route.fulfill({ status: 401, json: { code: 401 } });
  });
  await context.route('**/api/alerts/v1/**', route => {
    advisories += 1;
    return route.fulfill({ json: { data: { alerts: [] } } });
  });
  // An intentional public visit opts out of the new entry-session check.
  // Public advisory GETs themselves must still never rotate cookies.
  await page.goto('/?session=manual');
  await expect.poll(() => advisories).toBeGreaterThan(0);
  expect(refreshes).toBe(0);
});

test('a malformed scheduling hint is ignored rather than treated as a credential', async ({ page, context }) => {
  let refreshes = 0;
  await setHint(context, 'not-an-expiry');
  await authorize(context);
  await context.route('**/api/auth/v1/refresh-token', route => {
    refreshes += 1;
    return route.fulfill({ status: 401, json: { code: 401 } });
  });
  await page.goto('/dashboard');
  await expect(page.getByText('Choose emergency type')).toBeVisible();
  expect(refreshes).toBe(0);
});
