import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
});

for (const width of [320, 375, 768, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`login reuses the public header at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
      await page.goto('/login');
      const header = page.locator('header');
      await expect(header).toHaveCount(1);
      await expect(header).toHaveAttribute('data-hidden', 'false');
      await expect(header.getByRole('link', { name: /Cordova Emergency Response/ })).toHaveAttribute('href', '/');
      await expect(header.locator('img')).toHaveAttribute('width', '40');
      await expect(header.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
      await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
      await expect(header.locator('nav[aria-label="Primary navigation"]')).toHaveCount(0);
      for (const name of ['Services', 'How reporting works', 'Emergency help']) {
        await expect(header.getByRole('link', { name, exact: true })).toHaveCount(0);
      }
      await expect(header.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911');
      const box = (await header.boundingBox())!;
      expect(box.height).toBeCloseTo(64, 2);
      for (const link of [header.getByRole('link', { name: 'Back to Home' }), header.getByRole('link', { name: 'Call 911' })]) {
        const target = (await link.boundingBox())!;
        // Transformed browser coordinates can differ by sub-micro-pixels.
        expect(Math.round(target.height * 100) / 100).toBeGreaterThanOrEqual(44);
        expect(target.x).toBeGreaterThanOrEqual(0);
        expect(target.x + target.width).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
      await page.getByRole('tab', { name: 'Sign In', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Create Account', exact: true })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Back to Home' })).toBeVisible();
      await page.getByRole('tab', { name: 'Log In', exact: true }).click();
      if (process.env.LOGIN_HEADER_CAPTURE === 'true' && [375, 1440].includes(width)) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: `.impeccable/review/login-header-${width}-${theme}.png`, fullPage: true });
      }
    });
  }
}

test('account header keeps Home while section links remain on the landing page only', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await expect(page.locator('header nav')).toHaveCount(0);
  await page.locator('header').getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('header').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  for (const [name, anchor] of [['Services', 'services'], ['How reporting works', 'workflow'], ['Emergency help', 'hotlines']]) {
    await page.goto('/');
    const link = page.locator('header').getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', '#' + anchor);
    await link.click();
    await expect(page).toHaveURL(new RegExp('/#' + anchor + '$'));
    await expect(page.locator('#' + anchor)).toBeVisible();
  }
});

test('login header hides down, returns up and stays available for keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 550 });
  await page.goto('/login');
  const header = page.locator('header');
  const scroller = page.locator('[data-account-scroll]');
  const mainTop = await page.locator('main').evaluate(el => el.getBoundingClientRect().top + el.closest('[data-account-scroll]')!.scrollTop);
  await scroller.evaluate(el => el.scrollTo({ top: 180, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-hidden', 'true');
  expect(await page.locator('main').evaluate(el => el.getBoundingClientRect().top + el.closest('[data-account-scroll]')!.scrollTop)).toBe(mainTop);
  await scroller.evaluate(el => el.scrollTo({ top: 150, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await scroller.evaluate(el => el.scrollTo({ top: 220, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-hidden', 'true');
  await header.getByRole('link', { name: 'Back to Home' }).focus();
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await expect(header.getByRole('link', { name: 'Back to Home' })).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The incumbent global reduced-motion rule enforces 0.01ms !important.
  expect(await header.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.00001);
});

test('password-reset entry retains the shared header and untouched token form', async ({ page }) => {
  await page.goto('/login?resetToken=' + 'a'.repeat(64));
  await expect(page.locator('header nav')).toHaveCount(0);
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.locator('header').getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
  await expect(page.locator('header').getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911');
  await expect(page.getByRole('button', { name: 'Set new password' })).toBeVisible();
  await expect(page.getByTestId('landing-particles')).toHaveCount(0);
});
