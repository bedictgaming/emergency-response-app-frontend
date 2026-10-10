import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const citizen = { id: '00000000-0000-4000-8000-000000000001', name: 'Synthetic Citizen', email: 'synthetic@gmail.com', role: 'USER', permissions: [] };
const defaultMethods = { accountId: citizen.id, password: true, google: { connected: false, email: null as string | null }, canUnlinkGoogle: false };
async function fixture(page: Page, user = citizen, theme = 'light') {
  await page.addInitScript(({ user, theme }) => {
    localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('emergency-response-theme', theme);
    class Stream extends EventTarget { close() {} } Object.assign(window, { EventSource: Stream });
  }, { user, theme });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { code: 200, data: { user } } });
    if (path.endsWith('/auth/v1/login-methods')) return route.fulfill({ json: { code: 200, data: { ...defaultMethods, accountId: user.id } } });
    return route.fulfill({ json: { data: { incidents: [], alerts: [], pagination: { page: 1, total: 0, totalPages: 1 } } } });
  });
}
for (const width of [375, 1280]) for (const theme of ['light', 'dark']) {
  test(`password confirmation fits ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await fixture(page, citizen, theme); await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
    const password = page.getByLabel('Current password', { exact: true });
    await expect(password).toBeVisible(); await expect(password).toBeFocused();
    expect(await password.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/account-settings-${width}-${theme}.png`, fullPage: true });
    await password.fill('SyntheticOnly123'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(password).toHaveCount(0); await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('SyntheticOnly123');
  });
}
test('connect posts only the verified account and password, redirects only to Google', async ({ page }) => {
  await fixture(page); let posts = 0;
  await page.route('**/api/auth/v1/google/link', route => {
    posts++; expect(route.request().postDataJSON()).toEqual({ accountId: citizen.id, password: 'SyntheticOnly123' });
    return route.fulfill({ json: { code: 200, data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' } } });
  });
  await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic Google consent</h1>' }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('SyntheticOnly123');
  await page.getByRole('button', { name: 'Continue to Google', exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//); expect(posts).toBe(1);
});
test('wrong password stays recoverable without logging out or exposing provider errors', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/auth/v1/google/link', route => route.fulfill({ status: 403, json: { code: 403, message: 'Your current password was not confirmed. Try again or use Forgot password.' } }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('SyntheticOnly123'); await page.getByRole('button', { name: 'Continue to Google' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'password was not confirmed' })).toBeVisible(); await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\/settings$/); expect(await page.evaluate(() => localStorage.getItem('user'))).toContain(citizen.id);
});
test('untrusted navigation response is rejected', async ({ page }) => {
  await fixture(page); await page.route('**/api/auth/v1/google/link', route => route.fulfill({ json: { data: { authorizationUrl: 'https://untrusted.example.test/phishing' } } }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('SyntheticOnly123'); await page.getByRole('button', { name: 'Continue to Google' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Reload Settings' })).toBeVisible(); await expect(page).toHaveURL(/\/settings$/);
});
test('disconnect preserves password method and reloads actual server methods', async ({ page }) => {
  await fixture(page); let connected = true;
  await page.route('**/api/auth/v1/login-methods', route => route.fulfill({ json: { data: { ...defaultMethods, google: { connected, email: connected ? citizen.email : null }, canUnlinkGoogle: connected } } }));
  await page.route('**/api/auth/v1/google/unlink', route => { expect(route.request().postDataJSON()).toEqual({ accountId: citizen.id, password: 'SyntheticOnly123' }); connected = false; return route.fulfill({ json: { code: 200 } }); });
  await page.goto('/settings'); await page.getByRole('button', { name: 'Disconnect Google', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('SyntheticOnly123'); await page.getByRole('button', { name: 'Confirm disconnect' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Google disconnected' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toBeVisible();
});
test('cannot disconnect a Google-only account', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/auth/v1/login-methods', route => route.fulfill({ json: { data: { ...defaultMethods, password: false, google: { connected: true, email: citizen.email }, canUnlinkGoogle: false } } }));
  await page.goto('/settings'); await expect(page.getByText('Google is your only sign-in method. It cannot be disconnected yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect Google', exact: true })).toHaveCount(0);
});
test('expired access is renewed before owned Settings reads', async ({ page }) => {
  await fixture(page); let refreshes = 0;
  await page.context().addCookies([{ name: 'sessionRenewAt', value: String(Date.now() - 60_000), domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/auth/v1/refresh-token', route => { refreshes++; return route.fulfill({ json: { code: 200 } }); });
  await page.goto('/settings'); await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toBeVisible();
  expect(refreshes).toBe(1);
});
test('account switch discards the old password form without posting', async ({ page }) => {
  await fixture(page); let posts = 0;
  await page.route('**/api/auth/v1/google/link', route => { posts++; return route.fulfill({ status: 409, json: {} }); });
  await page.goto('/settings'); await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('SyntheticOnly123');
  await page.evaluate(() => {
    const next = JSON.stringify({ id: '00000000-0000-4000-8000-000000000002', role: 'USER' });
    localStorage.setItem('user', next); window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: next }));
  });
  await expect(page).toHaveURL(/\/login\?session=manual$/); expect(posts).toBe(0);
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
});
test('repeated submit produces one request and account switch rejects its late response', async ({ page }) => {
  await fixture(page); let posts = 0; let release!: () => void;
  const response = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/v1/google/link', async route => {
    posts++; await response; await route.fulfill({ json: { data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' } } }).catch(() => {});
  });
  await page.goto('/settings'); await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('SyntheticOnly123');
  await page.getByRole('form', { name: 'Connect Google', exact: true }).evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect.poll(() => posts).toBe(1);
  await page.evaluate(() => { localStorage.removeItem('user'); window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: null })); });
  release(); await expect(page).toHaveURL(/\/login\?session=manual$/); expect(posts).toBe(1);
});
test('method outage is retryable and does not use cached authorization', async ({ page }) => {
  await fixture(page); let reads = 0;
  await page.route('**/api/auth/v1/login-methods', route => { reads++; return reads < 3 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { data: defaultMethods } }); });
  await page.goto('/settings'); await expect(page.getByRole('alert').filter({ hasText: 'could not be loaded' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload Settings' }).click(); await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toBeVisible();
});
test('mismatched method ownership never opens a mutation form', async ({ page }) => {
  await fixture(page); await page.route('**/api/auth/v1/login-methods', route => route.fulfill({ json: { data: { ...defaultMethods, accountId: 'another-account' } } }));
  await page.goto('/settings'); await expect(page.getByRole('alert').filter({ hasText: 'could not be loaded' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toHaveCount(0);
});
test('linked query is not treated as proof of connection', async ({ page }) => {
  await fixture(page); await page.goto('/settings?googleLink=linked');
  await expect(page.getByRole('button', { name: 'Connect Google', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'could not be confirmed' })).toBeVisible(); await expect(page).toHaveURL(/\/settings$/);
});
test('retired responders cannot open Settings even with a forged profile', async ({ page }) => {
  await fixture(page, { ...citizen, role: 'RESPONDER' }); await page.goto('/settings'); await expect(page).toHaveURL(/\/login\?session=manual$/);
});
for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`${department} admin returns to its assigned dashboard`, async ({ page }) => {
    await fixture(page, { ...citizen, role: 'ADMIN', department, isMainAdmin: department === 'MAIN' } as typeof citizen);
    await page.goto('/settings'); await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('href', `/admin/${department.toLowerCase()}-dashboard`);
    await page.getByRole('button', { name: 'Connect Google', exact: true }).click(); await expect(page.getByLabel('Current password', { exact: true })).toBeVisible();
  });
}
