import { expect, test, type Page } from '@playwright/test';
import { isPointInCordova, isWithinCordovaMapBounds } from '../app/lib/cordovaBoundary';

async function citizenSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', name: 'Citizen', role: 'USER' }));
  });
  await page.route('**/api/**', route => {
    const section = new URL(route.request().url()).pathname.split('/')[2];
    return route.fulfill({ json: { data: { [section]: [], user: { id: 'citizen', name: 'Citizen', role: 'USER' } } } });
  });
}

test('a pin accepted by barangay geometry is not blocked by the approximate map outline', async ({ page }) => {
  expect(isPointInCordova(10.255, 123.967)).toBe(false);
  expect(isWithinCordovaMapBounds(10.255, 123.967)).toBe(true);

  await citizenSession(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 10.255, longitude: 123.967, accuracy: 35 });
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({
    json: { address: { village: 'Alegria', town: 'Cordova', province: 'Cebu' } },
  }));
  await page.goto('/dashboard');
  await expect(page.getByText('10.255000, 123.967000')).toBeVisible();
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/GPS is only a suggestion/)).toBeVisible();
  await expect(dialog.getByText('Location confirmed', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Confirm center' }).click();
  await expect(dialog.getByText('Location confirmed', { exact: true })).toBeVisible();
});

test('panning the map survives an unrelated form update, and manual address survives lookup', async ({ page }) => {
  await citizenSession(page);
  await page.route('https://nominatim.openstreetmap.org/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1300));
    await route.fulfill({ json: { address: { road: 'Incorrect Road', town: 'Cordova', province: 'Cebu' } } });
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();

  const dialog = page.getByRole('dialog');
  const map = dialog.locator('.leaflet-container');
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y, { steps: 8 });
  await page.mouse.up();

  await dialog.getByRole('textbox', { name: /Description of Incident/ }).fill('Smoke near the market');
  const geocodeResponse = page.waitForResponse(response => response.url().startsWith('https://nominatim.openstreetmap.org/reverse'));
  await dialog.getByRole('button', { name: 'Confirm center' }).click();
  await expect(dialog.getByText('Location confirmed', { exact: true })).toBeVisible();
  await expect(dialog.locator('span.font-mono').last()).not.toHaveText('10.252191, 123.949475');

  await dialog.getByRole('textbox', { name: 'Exact Location' }).fill('North entrance beside the clinic');
  await expect(dialog.getByRole('textbox', { name: 'Exact Location' })).toHaveValue('North entrance beside the clinic');
  await geocodeResponse;
  await expect(dialog.getByRole('textbox', { name: 'Exact Location' })).toHaveValue('North entrance beside the clinic');
});

test('rapid pin changes make only one reverse-geocoding request', async ({ page }) => {
  await citizenSession(page);
  let lookupCount = 0;
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    lookupCount += 1;
    return route.fulfill({ json: { address: { road: 'Market Road', town: 'Cordova', province: 'Cebu' } } });
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  const map = page.getByRole('dialog').locator('.leaflet-container');

  const lookupResponse = page.waitForResponse(response => response.url().startsWith('https://nominatim.openstreetmap.org/reverse'));
  // Keep both pin changes within the debounce window even on a busy runner.
  // Awaited Playwright clicks can take more than 1.1 seconds between events.
  await map.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    for (const x of [145, 155]) {
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + x,
        clientY: bounds.top + 125,
      }));
    }
  });
  await lookupResponse;
  expect(lookupCount).toBe(1);
});

test('a failed GPS refresh shows the last fix but does not prefill a stale incident pin', async ({ page }) => {
  await citizenSession(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition(success: (position: unknown) => void, failure: (error: unknown) => void) {
          setTimeout(() => success({ coords: { latitude: 10.255, longitude: 123.967, accuracy: 25 } }), 0);
          setTimeout(() => failure({ code: 3, TIMEOUT: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2 }), 300);
          return 1;
        },
        clearWatch() {},
      },
    });
  });
  await page.goto('/dashboard');
  await expect(page.getByText(/Last fix only/)).toBeVisible();
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await expect(page.getByRole('dialog').getByText(/No GPS fix/)).toBeVisible();
});
