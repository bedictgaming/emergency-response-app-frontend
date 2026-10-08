import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { data: { alerts: [] } } }));
});

for (const theme of ['light', 'dark'] as const) {
  test(`theme controls hydrate and move between home/login without mismatch in ${theme}`, async ({ page, request }) => {
    const hydrationIssues: string[] = [];
    page.on('pageerror', error => hydrationIssues.push(error.message));
    page.on('console', message => {
      if (/hydration|hydrated|server rendered|script tag while rendering/i.test(message.text())) {
        hydrationIssues.push(message.text());
      }
    });
    await page.addInitScript(theme => {
      if (!localStorage.getItem('emergency-response-theme')) {
        localStorage.setItem('emergency-response-theme', theme);
      }
    }, theme);

    // Neither instance may emit route/preference-dependent button markup in SSR.
    // Do not inspect serialized RSC props, which also contain "theme-toggle" text.
    for (const path of ['/', '/login']) {
      const response = await request.get(path);
      expect(response.ok()).toBe(true);
      expect(await response.text()).not.toMatch(/<button\b[^>]*class="[^"]*\btheme-toggle\b/);
    }

    const switchControl = page.getByRole('button', { name: /Switch to (light|dark) mode/ });
    await page.goto('/login');
    await expect(switchControl).toHaveCount(1);
    await expect(switchControl).toHaveCSS('position', 'fixed');
    await expect(switchControl).toHaveAttribute('aria-pressed', String(theme === 'dark'));
    await page.reload();
    await expect(switchControl).toHaveCount(1);
    await expect(switchControl).toHaveCSS('position', 'fixed');

    await page.locator('header').getByRole('link', { name: 'Back to Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(switchControl).toHaveCount(1);
    await expect(switchControl).toHaveCSS('position', 'fixed');
    await page.locator('header').getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(switchControl).toHaveCount(1);
    await expect(switchControl).toHaveCSS('position', 'fixed');
    await switchControl.click();
    await expect(switchControl).toHaveAttribute('aria-pressed', String(theme !== 'dark'));
    // The shared root control must retain the saved preference through navigation.
    await page.locator('header').getByRole('link', { name: 'Back to Home', exact: true }).click();
    await expect(switchControl).toHaveCSS('position', 'fixed');
    await expect(switchControl).toHaveAttribute('aria-pressed', String(theme !== 'dark'));
    await page.locator('header').getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(switchControl).toHaveCSS('position', 'fixed');
    await page.reload();
    await expect(switchControl).toHaveCount(1);
    await expect(switchControl).toHaveCSS('position', 'fixed');
    await expect(switchControl).toHaveAttribute('aria-pressed', String(theme !== 'dark'));
    expect(hydrationIssues).toEqual([]);
  });
}
