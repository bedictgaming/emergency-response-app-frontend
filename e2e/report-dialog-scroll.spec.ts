import { devices, expect, test, type Page } from '@playwright/test';

async function checkScrollStaysPut(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'scroll-citizen', name: 'Scroll Test', role: 'USER' }));
    let update: ((position: unknown) => void) | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition(success: (position: unknown) => void) {
          update = success;
          setTimeout(() => success({ coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 25 } }), 0);
          return 1;
        },
        clearWatch() {},
      },
    });
    (window as typeof window & { emitTestLocation?: () => void }).emitTestLocation = () => {
      update?.({ coords: { latitude: 10.2525, longitude: 123.95, accuracy: 20 } });
    };
  });
  await page.route('**/api/**', route => {
    const section = new URL(route.request().url()).pathname.split('/')[2];
    return route.fulfill({ json: { data: { [section]: [], user: { id: 'scroll-citizen', name: 'Scroll Test', role: 'USER' } } } });
  });

  await page.goto('/dashboard');
  await expect(page.getByText('10.252191, 123.949475')).toBeVisible();
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();

  const scrollArea = page.getByRole('dialog').locator('.dialog-scroll-area');
  const initialScroll = await scrollArea.evaluate(element => {
    element.scrollTop = 300;
    return element.scrollTop;
  });
  expect(initialScroll).toBeGreaterThan(150);

  await page.evaluate(() => (window as typeof window & { emitTestLocation?: () => void }).emitTestLocation?.());
  await expect(page.getByText('10.252500, 123.950000')).toBeVisible();
  await expect.poll(() => scrollArea.evaluate(element => element.scrollTop)).toBeGreaterThan(150);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('new GPS fixes do not jump an open report form back to the top', async ({ page }) => {
  await checkScrollStaysPut(page);
});

test.describe('mobile report form', () => {
  const pixel = devices['Pixel 7'];
  test.use({
    viewport: pixel.viewport,
    userAgent: pixel.userAgent,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });

  test('new GPS fixes preserve touch-sized dialog scroll position', async ({ page }) => {
    await checkScrollStaysPut(page);
  });
});
