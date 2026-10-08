import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const citizen = { id: 'synthetic-link-citizen', name: 'Synthetic Citizen', email: 'synthetic@gmail.com', role: 'USER', permissions: [] };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user));
    class Stream extends EventTarget { close() {} }
    Object.assign(window, { EventSource: Stream });
  }, citizen);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { code: 200, data: { user: citizen } } });
    if (path.endsWith('/auth/v1/google/link')) return route.fulfill({ json: { code: 200, data: { available: true, linked: false, hasPassword: true } } });
    return route.fulfill({ json: { code: 200, data: { incidents: [], alerts: [], pagination: { page: 1, total: 0, totalPages: 1 } } } });
  });
});

for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) {
  test(`account connection uses native disclosure and fits ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
    let requests = 0;
    page.on('request', request => { if (request.url().endsWith('/auth/v1/google/link')) requests++; });
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
    await expect(page.getByText('Account sign-in', { exact: true })).toBeVisible();
    expect(requests).toBe(0);
    await page.getByText('Account sign-in', { exact: true }).focus();
    await page.getByText('Account sign-in', { exact: true }).press('Enter');
    await expect(page.getByText('Google is not connected.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm password and connect Google' })).toBeDisabled();
    await expect(page.getByLabel('Current system password')).toHaveAttribute('autocomplete', 'current-password');
    await page.getByLabel('Current system password').fill('Synthetic-only123');
    const action = page.getByRole('button', { name: 'Confirm password and connect Google' });
    await expect(action).toBeEnabled();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByLabel('Current system password').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    for (const hover of [false, true]) {
      if (hover) await action.hover();
      await expect.poll(() => action.evaluate(button => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
            const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
          });
          return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        };
        const style = getComputedStyle(button); const fg = luminance(style.color); const bg = luminance(style.backgroundColor);
        return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      })).toBeGreaterThanOrEqual(4.5);
    }
    await page.mouse.move(0, 0); await page.getByLabel('Current system password').focus();
    if (process.env.GOOGLE_LINK_CAPTURE === 'true' && [390, 1440].includes(width)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `.impeccable/review/google-link-${width}-${theme}.png`, fullPage: true });
    }
    await page.getByText('Account sign-in', { exact: true }).press('Enter');
    await page.getByText('Account sign-in', { exact: true }).press('Enter');
    await expect(page.getByLabel('Current system password')).toHaveValue('');
  });
}

test('password-confirmed connect sends one request then navigates only to Google', async ({ page }) => {
  let submissions = 0;
  await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic Google authorization</h1>' }));
  await page.route('**/auth/v1/google/link', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { data: { available: true, linked: false, hasPassword: true } } });
    submissions++;
    expect(route.request().postDataJSON()).toEqual({ password: 'Synthetic-only123' });
    return route.fulfill({ json: { data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' } } });
  });
  await page.goto('/dashboard'); await page.getByText('Account sign-in', { exact: true }).click();
  await page.getByLabel('Current system password').fill('Synthetic-only123');
  await page.getByRole('button', { name: 'Confirm password and connect Google' }).click();
  await expect(page).toHaveURL('https://accounts.google.com/o/oauth2/v2/auth?state=synthetic'); expect(submissions).toBe(1);
});

test('wrong password remains recoverable and does not redirect or retry', async ({ page }) => {
  let submissions = 0;
  await page.route('**/auth/v1/google/link', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { data: { available: true, linked: false, hasPassword: true } } });
    submissions++; return route.fulfill({ status: 400, json: { errorCode: 'wrong_password' } });
  });
  await page.goto('/dashboard'); await page.getByText('Account sign-in', { exact: true }).click();
  await page.getByLabel('Current system password').fill('wrong'); await page.getByRole('button', { name: 'Confirm password and connect Google' }).click();
  await expect(page.locator('details').last().getByRole('alert')).toContainText('current system password is incorrect');
  await expect(page.getByLabel('Current system password')).toHaveValue(''); expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Retry status' }).click();
  await expect(page.locator('details').last().getByRole('alert')).toHaveCount(0); await expect(page).toHaveURL('/dashboard');
});

test('callback success hint never establishes a link without actual status', async ({ page }) => {
  await page.goto('/dashboard?googleLink=linked');
  await expect(page.getByText('A Google connection could not be confirmed. Your system password still works.')).toBeVisible();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('Google is not connected.', { exact: true })).toBeVisible();
});

test('unlink confirms password and clears browser identity after server success', async ({ page }) => {
  await page.route('**/auth/v1/google/link', route => route.fulfill({ json: { data: { available: true, linked: true, hasPassword: true } } }));
  let submissions = 0;
  await page.route('**/auth/v1/google/unlink', route => {
    submissions++; expect(route.request().postDataJSON()).toEqual({ password: 'Synthetic-only123' });
    return route.fulfill({ json: { code: 200, status: 'success' } });
  });
  await page.goto('/dashboard'); await page.getByText('Account sign-in', { exact: true }).click();
  await expect(page.getByText('Disconnecting Google signs out every session.', { exact: false })).toBeVisible();
  await page.getByLabel('Current system password').fill('Synthetic-only123');
  await page.getByRole('button', { name: 'Disconnect Google and sign out' }).click();
  await expect(page).toHaveURL('/login'); expect(submissions).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
});

test('Google-only account cannot disconnect without password fallback', async ({ page }) => {
  await page.route('**/auth/v1/google/link', route => route.fulfill({ json: { data: { available: true, linked: true, hasPassword: false } } }));
  await page.goto('/dashboard'); await page.getByText('Account sign-in', { exact: true }).click();
  await expect(page.getByText('To disconnect safely, first set a system password using', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect Google and sign out' })).toHaveCount(0);
});

test('unavailable status never presents a false unlinked state', async ({ page }) => {
  await page.route('**/auth/v1/google/link', route => route.fulfill({ status: 503, json: { code: 503 } }));
  await page.goto('/dashboard'); await page.getByText('Account sign-in', { exact: true }).click();
  await expect(page.locator('details').last().getByRole('alert')).toContainText('Connection status is unavailable');
  await expect(page.getByText('Google is not connected.', { exact: true })).toHaveCount(0);
});

test('cross-tab account switch clears private form and aborts late actions', async ({ page }) => {
  await page.goto('/dashboard'); await page.getByText('Account sign-in', { exact: true }).click();
  await page.getByLabel('Current system password').fill('Synthetic-only123');
  await page.evaluate(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'other', role: 'USER' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }));
  });
  await expect(page.getByLabel('Current system password')).toHaveCount(0);
});
