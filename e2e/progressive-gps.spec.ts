import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'gps-test', name: 'Synthetic citizen', role: 'USER' }));
    const callbacks: { success: PositionCallback; failure: PositionErrorCallback }[] = [];
    const stats = { watches: 0, estimates: 0, cleared: [] as number[] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(success: PositionCallback, failure: PositionErrorCallback, options: PositionOptions) {
        if (!options.enableHighAccuracy || options.maximumAge !== 0 || options.timeout !== 20_000) throw Error('Invalid report acquisition');
        callbacks.push({ success, failure }); stats.watches++; return stats.watches;
      },
      clearWatch(id: number) { stats.cleared.push(id); },
      getCurrentPosition(success: PositionCallback, _failure: PositionErrorCallback, options: PositionOptions) {
        if (options.enableHighAccuracy || options.maximumAge !== 30_000 || options.timeout !== 5000) throw Error('Invalid preliminary acquisition');
        stats.estimates++;
        setTimeout(() => success({ coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 800 }, timestamp: Date.now() - 15_000 } as GeolocationPosition), 0);
      },
    } });
    Object.assign(window, { gpsStats: stats, emitGps: (index: number, latitude = 10.252191, age = 0) => callbacks[index]?.success({
      coords: { latitude, longitude: 123.949475, accuracy: 25 }, timestamp: Date.now() - age,
    } as GeolocationPosition), denyGps: (index: number) => callbacks[index]?.failure({ code: 1 } as GeolocationPositionError) });
  });
  await page.route('**/api/**', route => route.fulfill({ json: { data: {
    user: { id: 'gps-test', name: 'Synthetic citizen', role: 'USER' }, incidents: [], alerts: [], items: [],
  } } }));
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: { address: { village: 'Poblacion', town: 'Cordova' } } }));
}
async function emit(page: Page, index = 0, latitude = 10.252191, age = 0) {
  await expect.poll(async () => (await stats(page)).watches).toBeGreaterThan(index);
  await page.evaluate(({ index, latitude, age }) => (window as typeof window & { emitGps: (i: number, lat: number, age: number) => void }).emitGps(index, latitude, age), { index, latitude, age });
}
async function stats(page: Page) {
  return page.evaluate(() => (window as typeof window & { gpsStats: { watches: number; estimates: number; cleared: number[] } }).gpsStats);
}
for (const width of [390, 1365]) {
  test(`preliminary estimate cannot submit; fresh shared fix stays locked at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await setup(page);
    let writes = 0; page.on('request', request => { if (request.url().includes('/api/') && request.method() === 'POST') writes++; });
    await page.goto('/dashboard');
    await expect(page.getByText(/Preliminary estimate only/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('preliminary-location.png') });
    await page.getByRole('button', { name: 'Report a fire emergency' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Confirm GPS location' })).toBeDisabled();
    await expect(dialog.locator('.leaflet-marker-icon')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Submit Report', exact: true }).click();
    expect(writes).toBe(0); expect(await stats(page)).toMatchObject({ watches: 1, estimates: 1 });
    await emit(page);
    await dialog.getByRole('button', { name: 'Confirm GPS location' }).click();
    await expect(dialog.getByText('Location confirmed', { exact: true })).toBeVisible();
    await emit(page, 0, 10.2525);
    await expect(dialog.getByText('GPS: 10.252191, 123.949475', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Location confirmed', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Refresh GPS' }).click();
    await emit(page, 0, 10.251);
    await expect(dialog.getByRole('button', { name: 'Confirm GPS location' })).toBeDisabled();
    await emit(page, 1, 10.2525);
    await expect(dialog.getByText('GPS: 10.252500, 123.949475', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Location confirmed', { exact: true })).toHaveCount(0);
    expect(await stats(page)).toMatchObject({ watches: 2, estimates: 2, cleared: [1] });
  });
}
test('a recent dashboard fix is reused without another acquisition', async ({ page }) => {
  await setup(page); await page.goto('/dashboard'); await emit(page);
  await expect(page.getByText('10.252191, 123.949475', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await expect(page.getByRole('button', { name: 'Confirm GPS location' })).toBeEnabled();
  expect(await stats(page)).toMatchObject({ watches: 1, estimates: 1 });
});
test('a stale dashboard fix triggers fresh acquisition instead of authorizing confirmation', async ({ page }) => {
  await setup(page); await page.clock.install(); await page.goto('/dashboard'); await emit(page);
  await page.clock.fastForward(6000);
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await expect(page.getByRole('button', { name: 'Confirm GPS location' })).toBeDisabled();
  await expect.poll(async () => (await stats(page)).watches).toBe(2);
  await emit(page, 1); await expect(page.getByRole('button', { name: 'Confirm GPS location' })).toBeEnabled();
});
test('permission revocation clears both estimate and confirmed report snapshot', async ({ page }) => {
  await setup(page); await page.goto('/dashboard'); await emit(page);
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await page.getByRole('button', { name: 'Confirm GPS location' }).click();
  await page.evaluate(() => (window as typeof window & { denyGps: (i: number) => void }).denyGps(0));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Location permission is blocked/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm GPS location' })).toBeDisabled();
  await expect(dialog.locator('.leaflet-marker-icon')).toHaveCount(0);
  await expect(dialog.getByText('Location confirmed', { exact: true })).toHaveCount(0);
});
test('timeout offers recovery; late old callbacks cannot restore location after navigation', async ({ page }) => {
  await setup(page); await page.clock.install(); await page.goto('/dashboard');
  await expect.poll(async () => (await stats(page)).watches).toBe(1);
  await page.clock.fastForward(21_000);
  await expect(page.getByText(/GPS timed out/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await emit(page, 0); await expect(page.getByText(/Preliminary estimate only/)).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await stats(page)).cleared).toContain(2);
  await emit(page, 1);
  await expect(page.getByText('10.252191, 123.949475')).toHaveCount(0);
});
