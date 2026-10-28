import { expect, test, type Page } from '@playwright/test';
import { installQuietEventStream } from './helpers/quiet-event-stream';
import { expectPinOnRadius } from './helpers/map-navigation';

test.use({ serviceWorkers: 'block' });
async function fixture(page: Page, baseURL: string) {
  const application = new URL(baseURL);
  if (!['localhost', '127.0.0.1'].includes(application.hostname)) throw new Error('Loopback-only synthetic map fixture');
  const user = { id: 'synthetic-map-lifecycle', name: 'Synthetic map citizen', email: 'map@example.invalid', role: 'USER', status: 'ACTIVE', department: null, isMainAdmin: false };
  await installQuietEventStream(page);
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user));
    let next = 0;
    const watches = new Map<number, ReturnType<typeof setInterval>>();
    const sample = () => ({ coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 15 }, timestamp: Date.now() } as GeolocationPosition);
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success: PositionCallback) { setTimeout(() => success(sample()), 0); },
      watchPosition(success: PositionCallback) { const id = ++next; setTimeout(() => success(sample()), 0); watches.set(id, setInterval(() => success(sample()), 5000)); return id; },
      clearWatch(id: number) { clearInterval(watches.get(id)); watches.delete(id); },
    } });
  }, user);
  const traffic = { tiles: 0 };
  await page.route(/^https?:\/\//, route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('.tile.openstreetmap.org')) {
      traffic.tiles++;
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#e9eee9" d="M0 0h256v256H0z"/></svg>' });
    }
    if (url.origin === application.origin) return route.continue();
    return route.abort();
  });
  const unexpectedWrites: string[] = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/auth/v1/login-methods')) return route.fulfill({ json: { data: { accountId: user.id, password: true, google: { connected: false, email: null }, canUnlinkGoogle: false } } });
    if (path.endsWith('/nearby-detection')) return route.fulfill({ json: { data: { radiusMeters: 100, active: true, nearby: false, complete: true } } });
    if (!['GET', 'HEAD'].includes(route.request().method()) && !path.endsWith('/auth/v1/refresh')) {
      unexpectedWrites.push(path); return route.fulfill({ status: 403, json: { message: 'No writes in map lifecycle fixture' } });
    }
    return route.fulfill({ json: { data: { user, incidents: [], items: [], hasMore: false, observedAt: new Date().toISOString(), enabled: false, flags: [],
      pagination: { page: 1, limit: 5, total: 0, pages: 0 }, summary: { total: 0, active: 0, responding: 0, resolved: 0 } } } });
  });
  return { unexpectedWrites, traffic };
}

for (const width of [1280, 390]) test(`map lifecycle ${width}: repeated dialog mounts and route return do not reuse destroyed maps`, async ({ page, baseURL }, info) => {
  if (!baseURL) throw new Error('Configured loopback base URL required');
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { unexpectedWrites, traffic } = await fixture(page, baseURL);
  await page.goto('/dashboard');
  const nearby = page.getByRole('region', { name: 'Nearby submitted reports', exact: true });
  await expect(nearby.locator('.incident-reference-radius')).toHaveCount(1);
  const ownMap = nearby.locator('.leaflet-container');
  await ownMap.evaluate(element => element.setAttribute('data-map-lifecycle-original', 'true'));
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'Report a fire emergency' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.incident-reference-radius')).toHaveCount(1);
    await expect(page.locator('.leaflet-container')).toHaveCount(2);
    await expect(dialog.getByRole('button', { name: 'Confirm GPS location' })).toBeEnabled();
    await expectPinOnRadius(dialog.locator('.leaflet-container'));
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(1);
    await expect(ownMap).toHaveAttribute('data-map-lifecycle-original', 'true');
  }
  await page.getByRole('link', { name: 'Account Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/?$/);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(nearby.locator('.incident-reference-radius')).toHaveCount(1);
  await expect(nearby.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expectPinOnRadius(nearby.locator('.leaflet-container'));
  expect(errors).toEqual([]); expect(unexpectedWrites).toEqual([]); expect(traffic.tiles).toBeGreaterThan(0);
  await nearby.scrollIntoViewIfNeeded();
  await nearby.screenshot({ path: info.outputPath(`map-lifecycle-${width}.png`), animations: 'disabled' });
});
