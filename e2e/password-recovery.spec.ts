import { expect, test } from '@playwright/test';

for (const width of [375, 1280]) for (const theme of ['light', 'dark']) {
  test(`recovery request and reset ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.addInitScript(value => localStorage.setItem('emergency-response-theme', value), theme);
    const calls: Array<{ path: string; body: unknown }> = [];
    await page.route('**/api/auth/v1/password-reset/**', route => {
      const path = new URL(route.request().url()).pathname;
      calls.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ status: path.endsWith('/request') ? 202 : 200,
        json: { code: path.endsWith('/request') ? 202 : 200, status: 'success',
          message: path.endsWith('/request') ? 'If an eligible account exists, password-reset delivery has been requested. Check your inbox and spam folder.' : 'Password reset successfully' } });
    });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByLabel('Account email')).toHaveValue('synthetic@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'If an eligible' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend verification/i })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('recovery-request.png'), fullPage: true });
    await page.goto('/login?resetToken=' + 'a'.repeat(64));
    await expect(page.getByLabel('New password')).toBeVisible();
    expect(calls).toHaveLength(1);
    await page.getByLabel('New password').fill('short');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '12–128 characters' })).toBeVisible();
    expect(calls).toHaveLength(1);
    await page.getByLabel('New password').fill('SyntheticOnly123');
    await page.screenshot({ path: testInfo.outputPath('recovery-reset.png'), fullPage: true });
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('status').filter({ hasText: 'Log in with your new password' })).toBeVisible();
    expect(calls).toEqual([
      { path: '/api/auth/v1/password-reset/request', body: { email: 'synthetic@example.test' } },
      { path: '/api/auth/v1/password-reset/confirm', body: { token: 'a'.repeat(64), password: 'SyntheticOnly123' } },
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
  });
}

test('invalid, repeated and mixed reset capabilities never submit or authenticate', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/auth/v1/**', route => { requests++; return route.abort(); });
  for (const query of ['resetToken=', 'resetToken=invalid', 'resetToken=' + 'a'.repeat(64) + '&resetToken=' + 'b'.repeat(64),
    'resetToken=' + 'a'.repeat(64) + '&oauth=success']) {
    await page.goto('/login?' + query);
    await expect(page.getByRole('alert').filter({ hasText: 'incomplete or invalid' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set new password' })).toBeDisabled();
  }
  expect(requests).toBe(0);
});

test('expired reset and service failure show useful errors without automatic retry', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/auth/v1/password-reset/**', route => {
    requests++;
    return route.fulfill({ status: requests === 1 ? 400 : 503,
      json: { status: 'error', message: requests === 1 ? 'Invalid or expired password-reset token' : 'Password processing is busy. Please try again shortly.' } });
  });
  await page.goto('/login?resetToken=' + 'a'.repeat(64));
  await page.getByLabel('New password').fill('SyntheticOnly123');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid or expired' })).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'processing is busy' })).toBeVisible();
  expect(requests).toBe(2);
});
