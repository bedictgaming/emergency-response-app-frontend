import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => {
  await context.route('**/api/**', route => route.fulfill({
    status: route.request().url().includes('/alerts') ? 200 : 401,
    json: route.request().url().includes('/alerts') ? [] : { message: 'Unauthorized' },
  }));
});

test('homepage metadata survives hydration and navigation without leaking private schema', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Cordova Emergency Response.*Cordova, Cebu/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\/cordova-emergency-response\.site\/?$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://cordova-emergency-response.site/images/seo-share-card.png');
  await page.getByRole('region', { name: /Report an emergency/ }).getByRole('link', { name: 'Report an emergency', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle('Log In and Sign Up | Cordova Emergency Response');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('homepage content and metadata are present without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3100/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Report an emergency. Share the details responders need.');
  await expect(page).toHaveTitle(/Cordova Emergency Response.*Cordova, Cebu/);
  await expect(page.getByRole('link', { name: 'Call 911', exact: true }).first()).toHaveAttribute('href', 'tel:911');
  await context.close();
});

for (const path of ['/login', '/dashboard', '/settings', '/admin/main-dashboard', '/admin/drrmo-dashboard', '/admin/analytics']) {
  test(`${path} serves noindex before JavaScript or authentication`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/<meta name="robots" content="[^"]*noindex/);
  });
}
