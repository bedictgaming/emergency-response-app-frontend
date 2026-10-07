import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  for (const [reason, message] of [
    ['oauth_link_required', 'Google was not linked to this account. Use your email and password to Log In, or choose “Forgot password?” to recover access.'],
    ['oauth_email_verification_required', 'This Google email cannot be used to create an account securely. Register with email, or use a verified Gmail or Google Workspace account.'],
    ['oauth_failed', 'Google login failed. Please try again.'],
  ]) {
    test(`${reason} explains sign-in without starting a session (${viewport.width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      let profileRequests = 0;
      await page.route('**/api/**', route => {
        if (route.request().url().includes('/auth/v1/me')) profileRequests++;
        return route.fulfill({ json: { data: { incidents: [] } } });
      });
      await page.goto(`/login?oauth=${reason}`);
      const alert = page.getByRole('main').getByRole('alert'); await expect(alert).toHaveText(message);
      await alert.scrollIntoViewIfNeeded(); await expect(alert).toBeVisible();
      const box = await alert.boundingBox(); expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole('tab', { name: 'Log In', exact: true })).toHaveAttribute('aria-selected', 'true');
      expect(profileRequests).toBe(0);
      if (reason === 'oauth_link_required') {
        await page.screenshot({ path: testInfo.outputPath('oauth-recovery.png'), fullPage: true });
        await page.getByRole('button', { name: 'Forgot password?' }).click();
        await expect(page.getByLabel('Account email')).toBeVisible();
      }
    });
  }
}
test('legacy OAuth failure links remain understandable', async ({ page }) => {
  await page.goto('/login?error=oauth_failed');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Google login failed');
});
test('unknown error query text is never rendered as an authentication message', async ({ page }) => {
  await page.goto('/login?oauth=untrusted-private-message');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});
