import { expect, test } from '@playwright/test';

for (const width of [375, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`traditional auth retained ${width} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await page.addInitScript(value => localStorage.setItem('emergency-response-theme', value), theme);
      const calls: string[] = [];
      await page.route('**/api/auth/v1/**', route => {
        const path = new URL(route.request().url()).pathname; calls.push(path);
        if (path.endsWith('/signup')) return route.fulfill({ json: { code: 200, status: 'success', message: 'Account created successfully! You can now log in.', data: { user: { role: 'USER', emailVerified: null } } } });
        return route.fulfill({ status: 401, json: { code: 401, status: 'error', message: 'Invalid email or password' } });
      });
      page.on('dialog', dialog => { expect(dialog.message()).toContain('now log in'); void dialog.accept(); });
      await page.goto('/login');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
      await page.getByLabel('Password', { exact: true }).fill('SyntheticOnly123');
      await page.getByRole('button', { name: 'Log In', exact: true }).click();
      await expect(page.getByRole('tabpanel', { name: 'Log In', exact: true }).getByRole('alert')).toContainText('Invalid email or password');
      await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
      await page.getByRole('tab', { name: 'Sign In', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Create Account', exact: true })).toBeVisible();
      await page.getByLabel('Full Name', { exact: true }).fill('Synthetic Citizen');
      await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
      await page.getByLabel('Password', { exact: true }).fill('SyntheticOnly123');
      await page.getByRole('button', { name: 'Create Account', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Log In', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('button', { name: /Resend verification|Send reset link/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(calls).toEqual(['/api/auth/v1/login', '/api/auth/v1/signup']);
      expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
    });
  }
}
