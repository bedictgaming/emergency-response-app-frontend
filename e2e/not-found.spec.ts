import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const paths = ['/missing-page', '/dashboard/missing-page', '/admin/missing-page', '/responder/missing-page'];
for (const width of [320, 390, 768, 1365]) for (const theme of ['light', 'dark']) {
  test(`shared missing-page recovery fits ${width}px in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response!.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
      await expect(page.getByText('404', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Go Back' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
      await expect(page.getByRole('link', { name: 'call 911' })).toHaveAttribute('href', 'tel:911');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const expectedTheme = path.startsWith('/admin/') ? 'light' : theme;
      await expect(page.locator('html')).toHaveClass(expectedTheme === 'dark' ? /dark/ : /^(?!.*\bdark\b).*$/);
      const palette = await page.locator('main').evaluate(el => {
        const main = getComputedStyle(el);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const rgb = (color: string) => {
          ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = (color: string) => rgb(color).map(v => {
          const value = v / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
        const ratio = (a: string, b: string) => {
          const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const description = getComputedStyle(el.querySelector('section > p:nth-of-type(2)')!);
        const home = getComputedStyle(el.querySelector('a[href="/"]')!);
        const code = getComputedStyle(el.querySelector('section > p')!);
        return { background: main.backgroundColor, bodyContrast: ratio(description.color, main.backgroundColor),
          actionContrast: ratio(home.color, home.backgroundColor), codeContrast: ratio(code.color, main.backgroundColor) };
      });
      expect(palette.background).toBe(expectedTheme === 'dark' ? 'rgb(10, 10, 10)' : 'rgb(251, 250, 249)');
      expect(palette.bodyContrast).toBeGreaterThanOrEqual(4.5);
      expect(palette.actionContrast).toBeGreaterThanOrEqual(4.5);
      expect(palette.codeContrast).toBeGreaterThanOrEqual(3);
      for (const action of [page.getByRole('button', { name: 'Go Back' }), page.getByRole('link', { name: 'Go Home' })]) {
        expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await action.focus(); await expect(action).toBeFocused();
      }
      await expect(page.locator('main')).toHaveAttribute('data-motion-active', 'false');
    }
    expect(errors).toEqual([]);
    if ([390, 1365].includes(width)) {
      await page.goto('/missing-page');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`not-found-${width}-${theme}.png`), fullPage: true });
    }
  });
}

test('missing-page controls recover and APIs are not replaced with 404 UI', async ({ page, request }) => {
  for (const path of ['/api', '/api/not-a-real-endpoint']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('Page Not Found');
    expect(response.headers()['cache-control']).toBe('no-store');
  }
  await page.route('**/api/**', route => route.fulfill({ json: { data: { alerts: [] } } }));
  await page.goto('/missing-page');
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/missing-page');
  await page.getByRole('link', { name: 'Go Home' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/missing-page', { referer: new URL('/', page.url()).href });
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page).toHaveURL('/');
});

test('missing-page remains usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    expect((await page.goto('/missing-page'))!.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go Home' })).toBeVisible();
    await page.getByRole('link', { name: 'Go Home' }).click();
    await expect(page).toHaveURL('/');
  } finally { await context.close(); }
});

test('bounded animation survives resizing and turns static with reduced motion', async ({ page }, info) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/missing-page');
  await expect(page.locator('main')).toHaveAttribute('data-motion-active', 'true');
  await expect(page.getByRole('link', { name: 'Go Home' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('not-found-motion-intro.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('main')).toHaveAttribute('data-motion-active', 'false');
  await expect(page.locator('canvas')).toBeHidden();
  await page.screenshot({ path: info.outputPath('not-found-landscape.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('missing-page theme switch updates the active scene and preserves admin light policy', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    if (!localStorage.getItem('emergency-response-theme')) localStorage.setItem('emergency-response-theme', 'light');
  });
  await page.goto('/missing-page');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(10, 10, 10)');
  await expect(page.getByRole('link', { name: 'Go Home' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('not-found-motion-dark.png') });
  await page.goto('/admin/missing-page');
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(251, 250, 249)');
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('emergency-response-theme'))).toBe('dark');
});
