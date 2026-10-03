import { expect, test, type Locator } from '@playwright/test';

async function expectBrandLogo(logo: Locator, size: number) {
  await expect(logo).toHaveAttribute('src', '/emergency-icon.png');
  await expect(logo).toHaveAttribute('alt', '');
  await expect(logo).toHaveAttribute('aria-hidden', 'true');
  await expect(logo).toHaveAttribute('width', String(size));
  await expect(logo).toHaveAttribute('height', String(size));
  await expect.poll(() => logo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const box = await logo.boundingBox();
  expect(box?.width).toBe(size);
  expect(box?.height).toBe(size);
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`shared emergency branding and literal Signin tab at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((preference) => localStorage.setItem('emergency-response-theme', preference), theme);
      await page.route('**/api/alerts/v1/public**', route => route.fulfill({ json: { data: { alerts: [] } } }));
      await page.goto('/');
      await expectBrandLogo(page.locator('header img[src="/emergency-icon.png"]'), 40);
      await expectBrandLogo(page.locator('footer img[src="/emergency-icon.png"]'), 40);
      await expect(page.locator('header').getByRole('link', { name: /Cordova Emergency Response/ })).toHaveAttribute('href', '/');
      await page.locator('header').screenshot({ path: testInfo.outputPath('landing-header.png') });
      await page.locator('footer').screenshot({ path: testInfo.outputPath('landing-footer.png') });

      await page.goto('/login');
      await expectBrandLogo(page.locator('header img[src="/emergency-icon.png"]'), 32);
      await expect(page.locator('main img[src="/emergency-icon.png"]')).toHaveCSS('width', '80px');
      await expect(page.getByRole('tab', { name: 'Login', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Sign Up', exact: true })).toHaveCount(0);
      await page.getByRole('tab', { name: 'Signin', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Create Account', exact: true })).toBeVisible();
      await expect(page.getByLabel('Full Name')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create Account', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('login-signin.png'), fullPage: true });
      await page.getByRole('tab', { name: 'Login', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    });
  }
}
