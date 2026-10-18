import { expect, test, type Page } from '@playwright/test';
import { expectPinOnRadius, expectZoomAndPan } from './helpers/map-navigation';

test.use({ serviceWorkers: 'block' });
const coordinates = { latitude: 10.252191, longitude: 123.949475 };
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f1f3ef"/><path d="M0 70H256M90 0V256" stroke="#fff" stroke-width="12"/></svg>';

async function fixture(page: Page, department: string | null, valid = true, dark = false) {
  const user = { id: 'map-fixture', name: 'Map fixture', role: department ? 'ADMIN' : 'USER', department, isMainAdmin: department === 'MAIN', status: 'ACTIVE' };
  const incident = {
    incidentId: 'map-incident', title: 'Synthetic map test', description: 'Synthetic location for map verification only.',
    status: 'ACTIVE', verificationStatus: 'VERIFIED', severityLevel: 'MEDIUM', reportedAt: '2026-10-18T00:00:00Z', reportedBy: user.id,
    requestedServices: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'], serviceResponses: [], reviewFlags: [], attachments: [], reporter: user,
    ...(valid ? coordinates : {}), type: { typeId: 'medical', typeName: 'Medical Emergency' },
    location: { address: 'Synthetic test location, Cordova' },
  };
  const googleRequests: string[] = [];
  page.on('request', request => { if (/maps\.google|google\.com\/maps/.test(request.url())) googleRequests.push(request.url()); });
  await page.addInitScript(({ user, dark }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-response-theme', dark ? 'dark' : 'light');
    class Stream extends EventTarget { close() {} }
    Object.assign(window, { EventSource: Stream });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { configurable: true, value: () => {} });
  }, { user, dark });
  await page.route('**/api/**', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403, json: { message: 'Read-only map fixture' } });
    return route.fulfill({ json: { data: { user, incidents: [incident], items: [], hasMore: false, enabled: false,
      pagination: { page: 1, limit: 12, total: 1, pages: 1 }, summary: { total: 1, active: 1, responding: 0, resolved: 0 },
    } } });
  });
  await page.route(/^https:\/\//, route => route.request().url().includes('tile.openstreetmap.org')
    ? route.fulfill({ contentType: 'image/svg+xml', body: tile }) : route.abort());
  return { googleRequests };
}

for (const width of [390, 1280]) {
  for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
    test(`${department} inline radius map at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const { googleRequests } = await fixture(page, department);
      await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
      const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('.incident-reference-radius')).toBeVisible();
      await expect(card.getByText('100 m reference radius', { exact: true })).toBeVisible();
      await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
      await expect(card.getByRole('link', { name: 'OpenStreetMap' })).toBeVisible();
      await expectZoomAndPan(page, card.locator('.leaflet-container'));
      await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /view map/i })).toHaveCount(0);
      await expect(page.locator('a[href*="google.com/maps"],iframe')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(googleRequests).toEqual([]);
      if (department === 'MAIN') {
        await expect(card.locator('.leaflet-tile-loaded').first()).toBeVisible();
        await card.screenshot({ path: info.outputPath('inline-map.png'), animations: 'disabled' });
      }
    });
  }
}

for (const dark of [false, true]) {
  test(`citizen inline map ${dark ? 'dark' : 'light'} — radius scales with geography`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fixture(page, null, true, dark);
    await page.goto('/dashboard');
    const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
    await card.scrollIntoViewIfNeeded();
    const circle = card.locator('.incident-reference-radius');
    await expect(circle).toBeVisible();
    const before = await circle.boundingBox();
    // 100 m at this latitude/zoom is about 85 px across, not a fixed 100 px circle.
    expect(before!.width).toBeGreaterThan(80);
    expect(before!.width).toBeLessThan(90);
    await card.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(async () => (await circle.boundingBox())!.width).toBeGreaterThan(before!.width * 1.9);
    if (dark) {
      await expect(card.getByRole('button', { name: 'Zoom in' })).toHaveCSS('background-color', 'rgb(51, 65, 85)');
      await expect(card.getByRole('button', { name: 'Zoom in' })).toHaveCSS('color', 'rgb(248, 250, 252)');
    }
    await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
    await expectZoomAndPan(page, card.locator('.leaflet-container'));
    await expect(page.getByRole('button', { name: /show map|view map|hide map/i })).toHaveCount(0);
    await expect(page.locator('a[href*="google.com/maps"]')).toHaveCount(0);
    await expect(card.locator('.leaflet-tile-loaded').first()).toBeVisible();
    await card.screenshot({ path: info.outputPath('citizen-map.png'), animations: 'disabled' });
  });
}

for (const department of [null, 'MEDICAL']) {
  test(`${department ?? 'citizen'} missing coordinates never fabricates a pin`, async ({ page }) => {
    await fixture(page, department, false);
    await page.goto(department ? '/admin/medical-dashboard' : '/dashboard');
    await expect(page.getByText('Map unavailable: this report has no valid recorded coordinates.')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon,.incident-reference-radius')).toHaveCount(0);
  });
}

test('tile failure keeps coordinates and radius, with explicit retry recovery', async ({ page }) => {
  await fixture(page, 'FIRE');
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/admin/fire-dashboard');
  const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText(/Base map tiles could not load/)).toBeVisible();
  await expect(card.locator('.incident-reference-radius')).toBeVisible();
  await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
  await page.route('https://*.tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: tile }));
  await card.getByRole('button', { name: 'Retry map tiles' }).click();
  await expect(card.getByText(/Base map tiles could not load/)).toHaveCount(0);
  await expect(card.locator('.leaflet-tile-loaded').first()).toBeVisible();
});

test('zoom limits and location popup never change the recorded coordinates', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, 'FIRE');
  await page.goto('/admin/fire-dashboard');
  const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await card.scrollIntoViewIfNeeded();
  const map = card.locator('.leaflet-container');
  await expect(map.locator('.incident-reference-radius')).toBeVisible();
  for (let index = 0; index < 4; index++) {
    const before = (await map.locator('.incident-reference-radius').boundingBox())!.width;
    await map.getByRole('button', { name: 'Zoom out', exact: true }).click();
    // Leaflet starts zoom animation on the next frame. Wait for an actual
    // scale change before another click, not merely the absence of its class.
    await expect.poll(async () => (await map.locator('.incident-reference-radius').boundingBox())!.width).toBeLessThan(before * 0.75);
    await expect(map).not.toHaveClass(/leaflet-zoom-anim/);
    await expectPinOnRadius(map);
  }
  await expect(map.getByRole('button', { name: 'Zoom out', exact: true })).toHaveAttribute('aria-disabled', 'true');
  for (let index = 0; index < 6; index++) {
    const before = (await map.locator('.incident-reference-radius').boundingBox())!.width;
    await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(async () => (await map.locator('.incident-reference-radius').boundingBox())!.width).toBeGreaterThan(before * 1.5);
    await expect(map).not.toHaveClass(/leaflet-zoom-anim/);
    await expectPinOnRadius(map);
  }
  await expect(map.getByRole('button', { name: 'Zoom in', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await map.getByTitle('Emergency location pin', { exact: true }).click();
  await expect(map.getByText('Reported Location', { exact: true })).toBeVisible();
  await expectPinOnRadius(map);
  await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
  await expect(card.getByText('100 m reference radius', { exact: true })).toBeVisible();
});

test.describe('touch map navigation', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('an off-center two-finger pinch changes scale, not the report anchor', async ({ page }) => {
    await fixture(page, 'FIRE');
    await page.goto('/admin/fire-dashboard');
    const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
    await card.scrollIntoViewIfNeeded();
    const map = card.locator('.leaflet-container');
    const circle = map.locator('.incident-reference-radius');
    await expect(circle).toBeVisible();
    const before = (await circle.boundingBox())!.width;
    const box = (await map.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    // An off-center gesture may pan the view, never edit the recorded pin.
    const x = box.x + box.width * 0.65, y = box.y + box.height * 0.65;
    const points = (distance: number) => [
      { id: 1, x: x - distance, y, radiusX: 1, radiusY: 1 },
      { id: 2, x: x + distance, y, radiusX: 1, radiusY: 1 },
    ];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(18) });
    for (const distance of [22, 28, 34, 40, 46]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await circle.boundingBox())!.width).toBeGreaterThan(before * 1.9);
    await expect(map).not.toHaveClass(/leaflet-zoom-anim/);
    await expectPinOnRadius(map);
    await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
    await session.detach();
  });
});
