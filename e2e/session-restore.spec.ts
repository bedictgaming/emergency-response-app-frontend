import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const site = 'http://127.0.0.1:3100';
const citizen = { id: 'restore-citizen', role: 'USER', name: 'Synthetic Citizen', email: 'citizen@example.test', permissions: [] };
const admin = { ...citizen, id: 'restore-admin', role: 'ADMIN', department: 'MAIN' };

async function seed(page: Page, user: typeof citizen = citizen) {
  await page.goto('/login?session=manual');
  await page.evaluate(value => {
    localStorage.setItem('user', JSON.stringify(value));
    localStorage.setItem('emergency-session-generation', 'synthetic-session');
  }, user);
}

async function mock(context: BrowserContext, user: typeof citizen = citizen) {
  await context.route('**/api/**', route => route.fulfill({ json: { data: { user, incidents: [], alerts: [], flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } }));
}

for (const width of [375, 1280]) {
  for (const [role, department, path] of [
    ['USER', undefined, '/dashboard'],
    ...['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO'].map(department => ['ADMIN', department, `/admin/${department.toLowerCase()}-dashboard`]),
    ['DISPATCHER', 'MAIN', '/admin/main-dashboard'],
  ]) {
    test(`${width}px restores ${role} ${department || 'citizen'} from server identity`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 800 });
      const serverUser = { ...citizen, role: role!, department };
      await mock(context, serverUser);
      // A forged cached admin must not choose the route over the server user.
      await seed(page, admin);
      await page.goto(width === 375 ? '/' : '/login');
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      expect(await page.evaluate(() => [localStorage.getItem('accessToken'), localStorage.getItem('refreshToken')])).toEqual([null, null]);
    });
  }
}

test('fresh browser context restores cookie-only citizen after reopening', async ({ browser }) => {
  const first = await browser.newContext();
  await first.addCookies([
    { name: 'refreshToken', value: 'synthetic-not-a-real-token', url: site, httpOnly: true, expires: Math.floor(Date.now() / 1000) + 600 },
    { name: 'sessionRenewAt', value: String(Date.now() - 1000), url: site, expires: Math.floor(Date.now() / 1000) + 600 },
  ]);
  const state = await first.storageState();
  await first.close();
  const reopened = await browser.newContext({ storageState: state });
  let refreshes = 0;
  await mock(reopened);
  await reopened.route('**/api/auth/v1/refresh-token', async route => {
    refreshes++;
    await reopened.addCookies([{ name: 'sessionRenewAt', value: String(Date.now() + 780000), url: site }]);
    await route.fulfill({ json: { data: { user: citizen } } });
  });
  const page = await reopened.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(refreshes).toBe(1);
  await reopened.close();
});

test('guest entry does not attempt authentication', async ({ page, context }) => {
  let checks = 0;
  await context.route('**/api/auth/v1/**', route => { checks++; return route.fulfill({ status: 401, json: {} }); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Report an emergency\./ })).toBeVisible();
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  expect(checks).toBe(0);
});

test('revoked session clears stale cache and permits login', async ({ page, context }) => {
  await mock(context);
  await context.route('**/api/auth/v1/me', route => route.fulfill({ status: 401, json: {} }));
  await context.route('**/api/auth/v1/refresh-token', route => route.fulfill({ status: 401, json: {} }));
  await seed(page);
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('user'))).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
});

for (const width of [375, 1280]) {
  test(`${width}px outage preserves session and provides recovery`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await mock(context);
    let unavailable = true;
    await context.route('**/api/auth/v1/me', route => unavailable
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { data: { user: citizen } } }));
    await seed(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Retry session check' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('user'))).not.toBeNull();
    await expect(page.getByRole('link', { name: 'Call 911', exact: true })).toHaveAttribute('href', 'tel:911');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`recovery-${width}.png`) });
    unavailable = false;
    await page.getByRole('button', { name: 'Retry session check' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
}

test('manual login cancels a pending late session response', async ({ page, context }) => {
  await mock(context);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/api/auth/v1/me', async route => {
    await held;
    await route.fulfill({ json: { data: { user: citizen } } }).catch(() => {});
  });
  await seed(page);
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Restoring your session...' })).toBeVisible();
  await page.getByRole('button', { name: 'Use Log In instead' }).click();
  await expect(page).toHaveURL(/\/login\?session=manual$/);
  release();
  await context.unrouteAll({ behavior: 'wait' });
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
});

test('cross-tab logout prevents a late response restoring the prior account', async ({ page, context }) => {
  await mock(context);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/api/auth/v1/me', async route => {
    await held;
    await route.fulfill({ json: { data: { user: citizen } } }).catch(() => {});
  });
  await seed(page);
  const second = await context.newPage();
  await second.goto('/login?session=manual');
  await page.goto('/login');
  await expect(page.getByRole('status', { name: 'Restoring your session...' })).toBeVisible();
  await second.evaluate(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('emergency-session-generation');
    localStorage.setItem('emergency-logout-epoch', 'synthetic-logout');
  });
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  release();
  await context.unrouteAll({ behavior: 'wait' });
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
  await expect(page).toHaveURL(/\/login$/);
});

test('reset action takes priority over cached session restoration', async ({ page, context }) => {
  let checks = 0;
  await mock(context);
  await context.route('**/api/auth/v1/me', route => { checks++; return route.fulfill({ json: { data: { user: citizen } } }); });
  await seed(page);
  await page.goto('/login?resetToken=synthetic-only');
  await expect(page.getByRole('button', { name: 'Set new password' })).toBeVisible();
  expect(checks).toBe(0);
});

test('retired responder cannot resume into a protected dashboard', async ({ page, context }) => {
  await mock(context, { ...citizen, role: 'RESPONDER' });
  await seed(page);
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('admin without an assigned department is not granted a dashboard', async ({ page, context }) => {
  await mock(context, { ...citizen, role: 'ADMIN' });
  await seed(page, admin);
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('expired access cookie renews once then restores the verified citizen', async ({ page, context }) => {
  await mock(context);
  let refreshes = 0;
  await context.route('**/api/auth/v1/me', route => refreshes === 0
    ? route.fulfill({ status: 401, json: {} })
    : route.fulfill({ json: { data: { user: citizen } } }));
  await context.route('**/api/auth/v1/refresh-token', route => { refreshes++; return route.fulfill({ json: { data: { user: citizen } } }); });
  await seed(page);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(refreshes).toBe(1);
});

test('page suspension cancels an old check and bfcache return rechecks', async ({ page, context }) => {
  await mock(context);
  let checks = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/api/auth/v1/me', async route => {
    checks++;
    if (checks === 1) await held;
    await route.fulfill({ json: { data: { user: citizen } } }).catch(() => {});
  });
  await seed(page);
  await page.goto('/login');
  await expect(page.getByRole('status', { name: 'Restoring your session...' })).toBeVisible();
  await expect.poll(() => checks).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  release();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(checks).toBeGreaterThan(1);
});

test('cross-tab account change cannot restore the old identity', async ({ page, context }) => {
  await mock(context);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/api/auth/v1/me', async route => {
    await held;
    await route.fulfill({ json: { data: { user: citizen } } }).catch(() => {});
  });
  await seed(page);
  const second = await context.newPage();
  await second.goto('/login?session=manual');
  await page.goto('/login');
  await expect(page.getByRole('status', { name: 'Restoring your session...' })).toBeVisible();
  await second.evaluate(value => localStorage.setItem('user', JSON.stringify(value)), admin);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  release();
  await context.unrouteAll({ behavior: 'wait' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user')!).id)).toBe(admin.id);
  await expect(page).toHaveURL(/\/login$/);
});
