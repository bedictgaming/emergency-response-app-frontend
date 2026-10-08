import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { data: { alerts: [] } } }));
});

for (const width of [320, 375, 768, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`split account layout keeps active forms usable at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
    await page.goto('/login');
    const shell = page.locator('[data-account-layout="split"]');
    const options = page.getByRole('complementary', { name: 'Account options' });
    const panel = page.getByRole('tabpanel');
    await expect(shell).toHaveAttribute('data-mode', 'login');
    await expect(panel).toHaveCount(1);
    const sidebar = (await options.boundingBox())!;
    const loginForm = (await panel.boundingBox())!;
    if (width < 768) expect(sidebar.y + sidebar.height).toBeLessThanOrEqual(loginForm.y + 1);
    else expect(sidebar.x).toBeGreaterThanOrEqual(loginForm.x + loginForm.width - 1);
    await expect(options).toHaveCSS('background-color', 'rgb(207, 0, 0)');
    await expect(options).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.getByLabel('Email', { exact: true }).fill('synthetic-layout@example.test');
    await options.getByRole('tab', { name: 'Sign In', exact: true }).click();
    await expect(shell).toHaveAttribute('data-mode', 'signup');
    await expect(panel).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Create Account', exact: true })).toBeVisible();
    await expect.poll(async () => {
      const aside = (await options.boundingBox())!;
      const form = (await panel.boundingBox())!;
      return width < 768 ? aside.y + aside.height <= form.y + 1 : aside.x + aside.width <= form.x + 1;
    }).toBe(true);
    await page.getByLabel('Full Name').fill('Synthetic Layout Citizen');
    await options.getByRole('tab', { name: 'Log In', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('synthetic-layout@example.test');
    await options.getByRole('tab', { name: 'Sign In', exact: true }).click();
    await expect(page.getByLabel('Full Name')).toHaveValue('Synthetic Layout Citizen');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Facebook|Github|LinkedIn|Skip|Resend verification/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [375, 1440]) {
  test(`split-panel motion respects Reduce Motion and recovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    const options = page.getByRole('complementary', { name: 'Account options' });
    expect(await options.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.00001);
    await options.getByRole('tab', { name: 'Log In', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(options.getByRole('tab', { name: 'Sign In', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Create Account', exact: true })).toBeVisible();
    await options.getByRole('tab', { name: 'Log In', exact: true }).click();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(options).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Reset password', exact: true })).toBeVisible();
    await expect(page.getByLabel('Account email')).toHaveCSS('font-size', '16px');
    await page.getByRole('button', { name: 'Back to Log In' }).click();
    await expect(options).toBeVisible();
  });
}
