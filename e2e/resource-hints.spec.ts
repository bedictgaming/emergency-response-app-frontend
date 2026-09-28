import { expect, test } from '@playwright/test';

const unusedLogoPreload = 'link[rel="preload"][as="image"][href$="/emergency-icon.png"]';

test('login logo loads without an unnecessary preload', async ({ page }) => {
  await page.goto('/login');
  const logo = page.getByRole('img', { name: 'Emergency Response' });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(unusedLogoPreload)).toHaveCount(0);
});

test('citizen dashboard logo loads without an unnecessary preload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', name: 'Citizen', role: 'USER' }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'citizen', name: 'Citizen', email: 'citizen@example.test', role: 'USER', permissions: ['incident:create-own'] } } },
  }));
  await page.route('**/api/incidents/v1/**', route => route.fulfill({
    json: { data: { incidents: [], pagination: { page: 1, pages: 1, total: 0, limit: 50 } } },
  }));
  await page.goto('/dashboard');
  const logo = page.getByRole('img', { name: 'Emergency Response' });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(unusedLogoPreload)).toHaveCount(0);
});
