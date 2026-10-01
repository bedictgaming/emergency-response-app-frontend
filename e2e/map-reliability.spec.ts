import { devices, expect, test, type Page } from '@playwright/test';
import { isPointInCordova, isWithinCordovaMapBounds } from '../app/lib/cordovaBoundary';

async function citizenSession(page: Page) {
  await page.addInitScript(() => localStorage.setItem('user', JSON.stringify({ id: 'citizen', name: 'Citizen', role: 'USER' })));
  await page.route('**/api/**', route => {
    const section = new URL(route.request().url()).pathname.split('/')[2];
    return route.fulfill({ json: { data: { [section]: [], user: { id: 'citizen', name: 'Citizen', role: 'USER' } } } });
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({
    json: { address: { village: 'Alegria', town: 'Cordova', province: 'Cebu' } },
  }));
}

async function openForm(page: Page) {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  return page.getByRole('dialog');
}

async function gpsProvider(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 10.255, longitude: 123.967, accuracy: 35 });
  await page.addInitScript(() => {
    let coords = { latitude: 10.255, longitude: 123.967, accuracy: 35 };
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (success: PositionCallback, _failure: PositionErrorCallback, options: PositionOptions) => {
        if (!options.enableHighAccuracy || options.maximumAge !== 0 || options.timeout !== 20_000) throw new Error('GPS request must be fresh and bounded');
        setTimeout(() => success({ coords: { ...coords }, timestamp: Date.now() } as GeolocationPosition), 0);
      },
    });
    Object.assign(window, { setTestGps: (latitude: number, longitude: number, accuracy: number) => { coords = { latitude, longitude, accuracy }; } });
  });
}

for (const device of ['desktop', 'mobile'] as const) {
  test.describe(`${device} GPS-locked report`, () => {
    if (device === 'mobile') {
      const pixel = devices['Pixel 7'];
      test.use({ viewport: pixel.viewport, userAgent: pixel.userAgent, deviceScaleFactor: pixel.deviceScaleFactor, isMobile: pixel.isMobile, hasTouch: pixel.hasTouch });
    }

    test('map interactions cannot move the GPS pin, approximate outline does not reject it', async ({ page }, testInfo) => {
      expect(isPointInCordova(10.255, 123.967)).toBe(false);
      expect(isWithinCordovaMapBounds(10.255, 123.967)).toBe(true);
      await citizenSession(page);
      await gpsProvider(page);
      const dialog = await openForm(page);
      const confirm = dialog.getByRole('button', { name: 'Confirm GPS location' });
      await expect(confirm).toBeEnabled();
      await expect(dialog.getByText('Location confirmed', { exact: true })).toHaveCount(0);
      const map = dialog.locator('.leaflet-container');
      const pin = map.locator('.leaflet-marker-icon');
      await expect(pin).toBeVisible();
      const initial = await pin.getAttribute('style');
      await map.click({ position: { x: 90, y: 160 } });
      await map.dblclick({ position: { x: 100, y: 170 } });
      const box = await map.boundingBox();
      await page.mouse.move(box!.x + 100, box!.y + 170);
      await page.mouse.down();
      await page.mouse.move(box!.x + 180, box!.y + 170, { steps: 8 });
      await page.mouse.up();
      await map.evaluate(element => element.setAttribute('tabindex', '0'));
      await map.focus();
      await page.keyboard.press('ArrowRight');
      await expect(pin).toHaveAttribute('style', initial!);
      await expect(dialog.getByText('GPS: 10.255000, 123.967000', { exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Confirm center' })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Cordova center' })).toHaveCount(0);
      await expect(dialog.getByText('Location confirmed', { exact: true })).toHaveCount(0);
      await confirm.click();
      await expect(dialog.getByText('Location confirmed', { exact: true })).toBeVisible();
      await dialog.getByText('GPS incident location', { exact: true }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await dialog.screenshot({ path: testInfo.outputPath('gps-locked-form.png') });
    });

    test('refresh replaces the GPS snapshot, requires reconfirmation, and retains the draft', async ({ page }) => {
      await citizenSession(page);
      await gpsProvider(page);
      const dialog = await openForm(page);
      await dialog.getByRole('button', { name: 'Confirm GPS location' }).click();
      await dialog.getByLabel('Description of Incident').fill('Clearly labeled test draft');
      await dialog.getByLabel('Contact Number').fill('09171234567');
      await dialog.getByLabel('Exact Location').fill('North entrance beside the clinic');
      await page.context().setGeolocation({ latitude: 10.254, longitude: 123.966, accuracy: 125 });
      await page.evaluate(() => (window as typeof window & { setTestGps: (lat: number, lng: number, accuracy: number) => void }).setTestGps(10.254, 123.966, 125));
      await expect(dialog.getByText('GPS: 10.255000, 123.967000', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Refresh GPS' }).click();
      await expect(dialog.getByText('GPS: 10.254000, 123.966000', { exact: true })).toBeVisible();
      await expect(dialog.getByText('Location confirmed', { exact: true })).toHaveCount(0);
      await expect(dialog.getByText(/accurate to about 125 m/)).toBeVisible();
      await expect(dialog.getByLabel('Description of Incident')).toHaveValue('Clearly labeled test draft');
      await expect(dialog.getByLabel('Contact Number')).toHaveValue('09171234567');
      await expect(dialog.getByLabel('Exact Location')).toHaveValue('North entrance beside the clinic');
      const confirm = dialog.getByRole('button', { name: 'Confirm GPS location' });
      await confirm.focus();
      await page.keyboard.press('Enter');
      await expect(dialog.getByText('Location confirmed', { exact: true })).toBeVisible();
    });
  });
}

for (const scenario of ['denied', 'unavailable', 'timeout', 'old', 'invalid', 'outside'] as const) {
  test(`${scenario} GPS cannot confirm, upload or submit; retry is available`, async ({ page }) => {
    await citizenSession(page);
    await page.addInitScript(scenario => {
      Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
        configurable: true,
        value: (success: PositionCallback, failure: PositionErrorCallback) => {
          if (scenario === 'timeout') return;
          if (scenario === 'denied' || scenario === 'unavailable') {
            setTimeout(() => failure({ code: scenario === 'denied' ? 1 : 2 } as GeolocationPositionError), 0);
            return;
          }
          setTimeout(() => success({
            coords: { latitude: scenario === 'outside' ? 11 : scenario === 'invalid' ? NaN : 10.255, longitude: 123.967, accuracy: 25 },
            timestamp: Date.now() - (scenario === 'old' ? 600_000 : 0),
          } as GeolocationPosition), 0);
        },
      });
    }, scenario);
    let unsafeRequests = 0;
    page.on('request', request => {
      if (request.url().includes('/api/') && request.method() === 'POST') unsafeRequests++;
    });
    if (scenario === 'timeout') await page.clock.install();
    const dialog = await openForm(page);
    if (scenario === 'timeout') await page.clock.fastForward(21_000);
    await expect(dialog.getByRole('button', { name: 'Confirm GPS location' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Refresh GPS' })).toBeEnabled();
    await expect(dialog.locator('.leaflet-marker-icon')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Submit Report', exact: true }).click();
    await expect(dialog.getByText(/Get a fresh GPS fix|outside the Cordova map area. This form/)).toBeVisible();
    expect(unsafeRequests).toBe(0);
  });
}

test('an expired fix cannot submit and requires a new confirmation', async ({ page }) => {
  await citizenSession(page);
  await gpsProvider(page);
  await page.clock.install();
  const dialog = await openForm(page);
  await dialog.getByRole('button', { name: 'Confirm GPS location' }).click();
  await page.clock.fastForward(301_000);
  await expect(dialog.getByText(/This GPS fix has expired/)).toBeVisible();
  await expect(dialog.getByText('Location confirmed', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Confirm GPS location' })).toBeDisabled();
});

test('late callbacks from replaced requests cannot restore the previous GPS fix', async ({ page }) => {
  await citizenSession(page);
  await page.addInitScript(() => {
    const callbacks: PositionCallback[] = [];
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (success: PositionCallback) => { callbacks.push(success); },
    });
    Object.assign(window, { emitGps: (index: number, latitude: number) => callbacks[index]?.({
      coords: { latitude, longitude: 123.967, accuracy: 25 }, timestamp: Date.now(),
    } as GeolocationPosition) });
  });
  await page.clock.install();
  const dialog = await openForm(page);
  await page.clock.fastForward(21_000);
  await dialog.getByRole('button', { name: 'Refresh GPS' }).click();
  await page.evaluate(() => (window as typeof window & { emitGps: (index: number, latitude: number) => void }).emitGps(0, 10.251));
  await expect(dialog.getByText(/GPS: 10.251000/)).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { emitGps: (index: number, latitude: number) => void }).emitGps(1, 10.255));
  await expect(dialog.getByText('GPS: 10.255000, 123.967000', { exact: true })).toBeVisible();
});
