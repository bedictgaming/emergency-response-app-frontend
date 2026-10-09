import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const token = '11111111-1111-4111-8111-111111111111';
for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
  test(`retired verification never blocks login ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    // Capture the settled layout, not a frame of the split-panel transition.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
    let retiredRequests = 0;
    await page.route('**/api/**', route => {
      if (/verify-email|resend-email-verification|google\/(?:link|unlink)/.test(route.request().url())) retiredRequests++;
      return route.fulfill({ json: { code: 200, data: { alerts: [], incidents: [] } } });
    });
    await page.goto(`/login?verificationToken=${token}&verified=true&googleLink=linked`);
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Verify your email|Email verification completed/ })).toHaveCount(0);
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByLabel('Email', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByRole('tab', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create Account', exact: true })).toBeVisible();
    await expect(page.getByText('Create a citizen account and log in immediately. No email verification required.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Verify email|Resend verification|Connect Google|Disconnect Google/i })).toHaveCount(0);
    expect(retiredRequests).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
    await page.getByRole('tab', { name: 'Log In', exact: true }).click();
    await page.screenshot({ path: `.impeccable/review/auth-removal-login-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
  });
}
test('old verification flags and malformed links do not redeem, authenticate or display results', async ({ page }) => {
  let retiredRequests = 0;
  await page.route('**/api/**', route => {
    if (/verify-email|resend-email-verification|google\/(?:link|unlink)/.test(route.request().url())) retiredRequests++;
    return route.fulfill({ json: { code: 200, data: { alerts: [] } } });
  });
  for (const path of ['/', '/login']) for (const query of [
    'verificationToken=', 'verificationToken=invalid', `verificationToken=${token}&verificationToken=${token}`,
    'verified=true', 'error=verification_failed', 'googleLink=linked',
  ]) {
    await page.goto(`${path}?${query}`);
    await expect(page.getByRole('heading', { name: /Verify your email|Email verification completed/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Verify email|Resend verification/i })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
    if (path === '/login') await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  }
  expect(retiredRequests).toBe(0);
});
test('unconnected password accounts retain a clear password recovery path, not email-match linking', async ({ page }) => {
  await page.goto('/login?oauth=oauth_link_required');
  await expect(page.getByRole('alert').filter({ hasText: 'This account uses email and password.' })).toBeVisible();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect Google/i })).toHaveCount(0);
});
