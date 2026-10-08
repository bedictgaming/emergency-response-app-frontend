import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  // All API traffic stays synthetic, including any login bootstrap request.
  await page.route('**/api/**', route => route.fulfill({
    status: route.request().url().includes('/alerts') ? 200 : 401,
    contentType: 'application/json',
    body: route.request().url().includes('/alerts') ? '[]' : '{"message":"Unauthorized"}',
  }));
});

for (const width of [320, 375, 390, 768, 1024, 1365, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Hero 01 preserves emergency actions at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 667 : 900 });
      await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
      await page.goto('/');
      // Keep the desktop two-line composition under wider fallback metrics too.
      if (width >= 1024) await page.addStyleTag({ content: 'body { font-family: Verdana, sans-serif !important; }' });
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      const hero = page.getByRole('region', { name: /Report an emergency/ });
      const heading = hero.getByRole('heading', { level: 1 });
      await expect(heading).toHaveAccessibleName('Report an emergency. Share the details responders need.');
      const report = hero.getByRole('link', { name: 'Report an emergency', exact: true });
      const call = hero.getByRole('link', { name: 'Call 911', exact: true });
      await expect(report).toHaveAttribute('href', '/login');
      await expect(call).toHaveAttribute('href', 'tel:911');
      for (const action of [report, call]) {
        await expect(action).toBeVisible();
        const box = await action.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.y + box!.height).toBeLessThanOrEqual(width < 768 ? 667 : 900);
        await action.focus();
        await expect(action).toBeFocused();
        expect(await action.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
      }
      await expect(hero.getByRole('listitem')).toHaveCount(3);
      await expect(page.getByTestId('report-preparation-icon-tile')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width >= 1024) {
        for (const line of await heading.locator(':scope > span').all()) {
          expect(await line.evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThan(1.1);
        }
      }
      if (process.env.HERO_CAPTURE === 'true' && [390, 1365, 1440].includes(width)) {
        await page.locator('body').click({ position: { x: 2, y: 2 } });
        await page.evaluate(() => window.scrollTo(0, 0));
        // Let arrival settle; the scanner now keeps looping over readable ink.
        await page.waitForTimeout(4600);
        const label = width === 1440 ? 'desktop' : width === 390 ? 'mobile' : 'user-1365';
        await page.screenshot({ path: `.impeccable/review/${label}${theme === 'dark' ? '-dark' : ''}.png`, fullPage: true });
      }
    });
  }
}

test('hero report action navigates to existing login with optional Google and recovery', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: /Report an emergency/ }).getByRole('link', { name: 'Report an emergency', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.getByText('Resend verification email', { exact: true })).toHaveCount(0);
});

test('hero is immediately readable with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  await page.goto('/');
  const hero = page.getByRole('region', { name: /Report an emergency/ });
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Report an emergency', exact: true })).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Call 911', exact: true })).toBeVisible();
  await context.close();
});

test('reduced-motion hero does not move or hide its reporting action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const action = page.getByRole('region', { name: /Report an emergency/ }).getByRole('link', { name: 'Report an emergency', exact: true });
  await action.hover();
  await expect(action).toBeVisible();
  expect(await action.locator('svg').evaluate(el => getComputedStyle(el).transform)).toBe('none');
});
