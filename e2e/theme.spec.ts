import { expect, test } from '@playwright/test';

async function surfaceIconContrast(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => {
    const content = element.querySelector('svg') ?? element;
    const channels = (value: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const luminance = (value: string) => {
      const [red, green, blue] = channels(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const background = luminance(getComputedStyle(element).backgroundColor);
    const foreground = luminance(getComputedStyle(content).color);
    return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
  });
}

test('theme switch persists light and dark preferences', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('emergency-response-theme')) {
      localStorage.setItem('emergency-response-theme', 'light');
    }
  });
  await page.goto('/');

  const darkToggle = page.getByRole('button', { name: 'Switch to dark mode' });
  await expect(darkToggle).toBeVisible();
  await darkToggle.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('emergency-response-theme'))).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('first visit follows the operating-system color preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
});

test('landing inverse icon and sign-in control retain contrast in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(selectedTheme => {
      localStorage.setItem('emergency-response-theme', selectedTheme);
    }, theme);
    await page.goto('/');

    const iconTile = page.getByTestId('report-preparation-icon-tile');
    await expect(iconTile).toBeVisible();
    expect(await surfaceIconContrast(iconTile)).toBeGreaterThanOrEqual(3);

    const signIn = page.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toBeVisible();
    expect(await surfaceIconContrast(signIn)).toBeGreaterThanOrEqual(4.5);
  }
});

test('admin pages stay light without changing the citizen theme preference', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('emergency-response-theme', 'dark');
    localStorage.setItem('user', JSON.stringify({ id: 'admin', name: 'Admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'ADMIN', department: 'MAIN', isMainAdmin: true, permissions: [] } } } }));
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await page.goto('/admin/main-dashboard');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: /Switch to (dark|light) mode/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('emergency-response-theme'))).toBe('dark');

  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
});

test('citizen location, medical, and police icons remain visible in both themes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', name: 'Citizen', role: 'USER' }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'citizen', name: 'Citizen', email: 'citizen@example.test', role: 'USER', permissions: ['incident:create-own'] } } },
  }));
  await page.route('**/api/incidents/v1/**', route => route.fulfill({
    json: { data: { incidents: [], pagination: { page: 1, pages: 1, total: 0, limit: 50 } } },
  }));

  for (const theme of ['light', 'dark']) {
    await page.addInitScript(selectedTheme => {
      localStorage.setItem('emergency-response-theme', selectedTheme);
    }, theme);
    await page.goto('/dashboard');

    for (const testId of ['gps-icon-tile', 'medical-icon-tile', 'police-icon-tile']) {
      const tile = page.getByTestId(testId);
      await expect(tile).toBeVisible();
      const contrast = await surfaceIconContrast(tile);
      expect(contrast, `${theme} ${testId}`).toBeGreaterThanOrEqual(3);
    }

    const help = page.getByRole('complementary', { name: 'Help and status' });
    await expect(help).toBeVisible();
    const call911 = help.getByRole('link', { name: 'Call 911 for emergency help' });
    expect(await surfaceIconContrast(call911), `${theme} call action`).toBeGreaterThanOrEqual(4.5);
  }
});
