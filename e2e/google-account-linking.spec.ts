import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const citizen = { id: 'synthetic-citizen', name: 'Synthetic Citizen', email: 'synthetic@example.test', role: 'USER', permissions: [] };
for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
  test(`citizen dashboard has no manual Google connection ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page.addInitScript(({ user, theme }) => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('emergency-response-theme', theme);
      class Stream extends EventTarget { close() {} }
      Object.assign(window, { EventSource: Stream });
    }, { user: citizen, theme });
    let retiredRequests = 0;
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (/verify-email|google\/(?:link|unlink)/.test(path)) retiredRequests++;
      if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { code: 200, data: { user: citizen } } });
      return route.fulfill({ json: { code: 200, data: { incidents: [], alerts: [], pagination: { page: 1, total: 0, totalPages: 1 } } } });
    });
    await page.goto('/dashboard?googleLink=linked');
    await expect(page.getByRole('heading', { name: 'Choose emergency type' })).toBeVisible();
    await expect(page.getByText('Account sign-in', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Connect Google|Disconnect Google|Verify email/i })).toHaveCount(0);
    await expect(page.getByLabel('Current system password')).toHaveCount(0);
    expect(retiredRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/auth-removal-dashboard-${width}-${theme}.png`, fullPage: true });
  });
}
