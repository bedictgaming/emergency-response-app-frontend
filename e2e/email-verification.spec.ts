import { expect, test } from '@playwright/test';

// Synthetic capabilities only. These tests never contact an email provider.
const token = '11111111-1111-4111-8111-111111111111';

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 667 }]) {
  for (const theme of ['light', 'dark']) {
    test(`verification confirmation and result ${viewport.width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(value => localStorage.setItem('emergency-response-theme', value), theme);
      let requests = 0;
      await page.route('**/api/auth/v1/verify-email?**', route => {
        requests++;
        expect(route.request().headers().accept).toBe('application/json');
        expect(new URL(route.request().url()).searchParams.get('token')).toBe(token);
        return route.fulfill({ json: { code: 200, status: 'success', message: 'Email verified' } });
      });
      await page.goto(`/login?verificationToken=${token}`);
      await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      expect(requests).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const button = page.getByRole('button', { name: 'Verify email', exact: true });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/verification-${viewport.width}-${theme}.png`, fullPage: true });
      await button.click();
      await expect(page).toHaveURL('/login?verified=true');
      await expect(page.getByRole('status').filter({ hasText: 'Email verification completed' })).toBeVisible();
      expect(requests).toBe(1);
      expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
      await page.screenshot({ path: `test-results/verification-result-${viewport.width}-${theme}.png`, fullPage: true });
    });
  }
}

test('malformed, repeated and mixed-purpose capabilities do not send a request', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/auth/v1/verify-email?**', route => { requests++; return route.abort(); });
  for (const query of ['verificationToken=', 'verificationToken=invalid', `verificationToken=${token}&verificationToken=${token}`, `verificationToken=${token}&resetToken=other`, `verificationToken=${token}&oauth=success`]) {
    await page.goto(`/login?${query}`);
    await expect(page.getByRole('alert').filter({ hasText: 'incomplete or invalid' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeDisabled();
  }
  expect(requests).toBe(0);
});

test('expired links show recovery; a redirect/html response cannot claim success', async ({ page }) => {
  for (const response of [{ status: 410, json: { code: 410, status: 'error' } }, { status: 200, contentType: 'text/html', body: '<html>Not verified</html>' }]) {
    await page.route('**/api/auth/v1/verify-email?**', route => route.fulfill(response));
    await page.goto(`/login?verificationToken=${token}`);
    await page.getByRole('button', { name: 'Verify email', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /invalid or expired|could not be completed/ })).toBeVisible();
    await expect(page).toHaveURL(`/login?verificationToken=${token}`);
    await expect(page.getByRole('heading', { name: 'Email verification completed' })).toHaveCount(0);
    await page.unroute('**/api/auth/v1/verify-email?**');
  }
});

test('a temporary failure is retryable only by another explicit click', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/auth/v1/verify-email?**', route => {
    requests++;
    return route.fulfill(requests === 1 ? { status: 503, json: { code: 503, status: 'error' } } : { json: { code: 200, status: 'success' } });
  });
  await page.goto(`/login?verificationToken=${token}`);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Check your connection' })).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page).toHaveURL('/login?verified=true');
  expect(requests).toBe(2);
});

test('old redirect flags display results without becoming authentication authority', async ({ page }) => {
  for (const path of ['/', '/login']) {
    await page.goto(`${path}?verified=true`);
    await expect(page.getByRole('heading', { name: 'Email verification completed' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
    await page.goto(`${path}?error=verification_failed`);
    await expect(page.getByRole('alert').filter({ hasText: 'Email verification unsuccessful' })).toBeVisible();
    await page.goto(`${path}?verified=true&verified=true`);
    await expect(page.getByRole('heading', { name: 'Email verification completed' })).toHaveCount(0);
  }
});
