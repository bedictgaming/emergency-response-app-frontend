import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'header-citizen', name: 'Synthetic Citizen', email: 'synthetic-citizen@example.test', role: 'USER' }));
    class Stream extends EventTarget { close() {} }
    Object.assign(window, { EventSource: Stream });
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user: {
      id: 'header-citizen', name: 'Synthetic Citizen', email: 'synthetic-citizen@example.test', role: 'USER', status: 'ACTIVE',
    } } } });
    return route.fulfill({ json: { data: { incidents: [], alerts: [], pagination: { page: 1, total: 0, totalPages: 1 } } } });
  });
});

for (const width of [320, 375, 768, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`citizen shared header preserves reporting and logout at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 667 : 900 });
    await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
    await page.goto('/dashboard');
    const header = page.locator('header');
    await expect(header).toHaveAttribute('data-header-frame', 'shared');
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await expect(header.getByRole('heading', { name: 'Cordova Emergency Response' })).toBeVisible();
    await expect(header.locator('img')).toHaveAttribute('width', '40');
    await expect(page.getByRole('button', { name: 'Report a fire emergency' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911');
    await expect(header.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    const logout = (await header.getByRole('button', { name: 'Logout', exact: true }).boundingBox())!;
    // Browser transforms can produce a sub-micro-pixel rounding difference.
    expect(Math.round(logout.height * 100) / 100).toBeGreaterThanOrEqual(44);
    expect(logout.x + logout.width).toBeLessThanOrEqual(width);
    expect((await header.boundingBox())!.height).toBe(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 768) await expect(header.getByText('synthetic-citizen@example.test')).toBeVisible();
    if (process.env.DASHBOARD_HEADER_CAPTURE === 'true' && [375, 1440].includes(width)) {
      await header.screenshot({ path: `.impeccable/review/citizen-header-${width}-${theme}.png` });
    }
    const mainTop = await page.locator('main').evaluate(el => el.getBoundingClientRect().top + scrollY);
    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (maxScroll > 120) {
      const down = Math.min(180, maxScroll);
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), down);
      await expect(header).toHaveAttribute('data-hidden', 'true');
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), down - 30);
      await expect(header).toHaveAttribute('data-hidden', 'false');
    }
    expect(await page.locator('main').evaluate(el => el.getBoundingClientRect().top + scrollY)).toBe(mainTop);
    await header.getByRole('button', { name: 'Logout', exact: true }).focus();
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await header.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.00001);
    await expect(page.getByTestId('landing-particles')).toHaveCount(0);
  });
}

test('citizen logout retains cleanup and returns to the public landing page', async ({ page }) => {
  await page.goto('/dashboard');
  await page.locator('header').getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
});
