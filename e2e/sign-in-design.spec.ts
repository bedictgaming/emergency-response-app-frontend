import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { data: { alerts: [] } } }));
});

for (const width of [320, 375, 768, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`original sign-in design retains account actions at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
    await page.goto('/login');
    // Account content reaches the viewport bottom; the theme control floats
    // over the page instead of owning an opaque reserved bottom strip.
    await expect.poll(async () => page.locator('[data-account-scroll]').evaluate(el => {
      const box = el.getBoundingClientRect();
      return Math.abs(box.bottom - window.innerHeight);
    })).toBeLessThan(1);
    const panel = page.locator('[data-auth-panel="original"]');
    await expect(panel.getByRole('heading', { name: 'Welcome Back', exact: true })).toBeVisible();
    await expect(panel.locator('img')).toHaveAttribute('width', '40');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    const shell = page.locator('[data-account-layout="split"]');
    const shellBox = (await shell.boundingBox())!;
    expect(Math.abs(shellBox.x + shellBox.width / 2 - width / 2)).toBeLessThan(1);
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveCSS('font-size', '16px');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    for (const name of ['Continue with Google', 'Show password', 'Forgot password?', 'Log In']) {
      const box = (await panel.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(Math.round(box.height * 100) / 100).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel('Email', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeFocused();
    expect(await page.getByRole('button', { name: 'Forgot password?' }).evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await expect(page.getByRole('button', { name: /Github|Skip for now|Resend verification/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const loginAction = panel.getByRole('button', { name: 'Log In', exact: true });
    await loginAction.scrollIntoViewIfNeeded();
    const loginActionBox = (await loginAction.boundingBox())!;
    const loginThemeBox = (await page.getByRole('button', { name: /Switch to (light|dark) mode/ }).boundingBox())!;
    expect(loginThemeBox.x >= loginActionBox.x + loginActionBox.width
      || loginThemeBox.y >= loginActionBox.y + loginActionBox.height
      || loginThemeBox.y + loginThemeBox.height <= loginActionBox.y).toBe(true);
    if (process.env.SIGN_IN_CAPTURE === 'true' && [375, 1440].includes(width)) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-account-scroll]').evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
      await expect.poll(async () => Math.round((await page.locator('header').boundingBox())!.y)).toBe(0);
      await page.screenshot({ path: `.impeccable/review/sign-in-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
    await page.getByRole('tab', { name: 'Sign Up', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Create Account', exact: true })).toBeVisible();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    const signupBox = (await shell.boundingBox())!;
    expect(Math.abs(signupBox.x + signupBox.width / 2 - width / 2)).toBeLessThan(1);
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    await expect(panel.getByText('Create a citizen account and log in immediately. No email verification required.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up with Google', exact: true })).toBeVisible();
    const themeSwitch = page.getByRole('button', { name: /Switch to (light|dark) mode/ });
    await expect(themeSwitch).toHaveCount(1);
    await expect(themeSwitch).toHaveCSS('position', 'fixed');
    const createButton = (await panel.getByRole('button', { name: 'Create Account', exact: true }).boundingBox())!;
    const switchBox = (await themeSwitch.boundingBox())!;
    expect(Math.abs(switchBox.x + switchBox.width - (width - 16))).toBeLessThan(1);
    expect(Math.abs(switchBox.y + switchBox.height - ((width < 768 ? 812 : 900) - 16))).toBeLessThan(1);
    const overlaps = switchBox.x < createButton.x + createButton.width && switchBox.x + switchBox.width > createButton.x
      && switchBox.y < createButton.y + createButton.height && switchBox.y + switchBox.height > createButton.y;
    expect(overlaps).toBe(false);
    await panel.getByRole('button', { name: 'Create Account', exact: true }).scrollIntoViewIfNeeded();
    const submitAfterScroll = (await panel.getByRole('button', { name: 'Create Account', exact: true }).boundingBox())!;
    const fixedAfterScroll = (await themeSwitch.boundingBox())!;
    expect(fixedAfterScroll.x >= submitAfterScroll.x + submitAfterScroll.width
      || fixedAfterScroll.y >= submitAfterScroll.y + submitAfterScroll.height
      || fixedAfterScroll.y + fixedAfterScroll.height <= submitAfterScroll.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.SIGN_IN_CAPTURE === 'true' && [375, 1440].includes(width)) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-account-scroll]').evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
      await expect.poll(async () => Math.round((await page.locator('header').boundingBox())!.y)).toBe(0);
      await page.screenshot({ path: `.impeccable/review/sign-up-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
    await page.getByRole('tab', { name: 'Log In', exact: true }).click();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(panel.getByRole('heading', { name: 'Reset password', exact: true })).toBeVisible();
    await expect(page.getByLabel('Account email')).toHaveCSS('font-size', '16px');
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Log In' }).click();
    await expect(panel.getByRole('heading', { name: 'Welcome Back', exact: true })).toBeVisible();
    await expect(page.getByTestId('landing-particles')).toHaveCount(0);
  });
}

test('Google start retains account-switch cleanup and the authorized backend endpoint', async ({ page }) => {
  await page.addInitScript(() => {
    // Seed only the old login page, not the synthetic OAuth destination.
    if (location.pathname !== '/login') return;
    localStorage.setItem('user', JSON.stringify({ id: 'synthetic-old-user', role: 'USER' }));
    localStorage.setItem('accessToken', 'synthetic-legacy-token');
    localStorage.setItem('refreshToken', 'synthetic-legacy-refresh');
  });
  await page.route('**/api/auth/v1/google', route => route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic OAuth handoff</h1>' }));
  // This is an intentional account switch, not an automatic session restore.
  await page.goto('/login?session=manual');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page).toHaveURL(/\/api\/auth\/v1\/google$/);
  expect(await page.evaluate(() => ['user', 'accessToken', 'refreshToken'].map(key => localStorage.getItem(key)))).toEqual([null, null, null]);
});
