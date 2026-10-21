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
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => peer.close());
  await page.route('**/api/**', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403, json: { message: 'Read-only map fixture' } });
    return route.fulfill({ json: { data: { user, incidents: [incident], items: [], hasMore: false, enabled: false,
      pagination: { page: 1, limit: 12, total: 1, pages: 1 }, summary: { total: 1, active: 1, responding: 0, resolved: 0 },
    } } });
  });
  await page.route(/^https:\/\//, route => route.request().url().includes('tile.openstreetmap.org')
    ? route.fulfill({ contentType: 'image/svg+xml', body: tile }) : route.abort());
  return { googleRequests, incident };
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
      const viewMap = card.getByRole('button', { name: 'View map', exact: true });
      await expect(viewMap).toBeVisible();
      const buttonBounds = await viewMap.boundingBox();
      expect(buttonBounds!.height).toBeGreaterThanOrEqual(44);
      expect(buttonBounds!.width).toBeGreaterThanOrEqual(44);
      await expect(page.locator('a[href*="google.com/maps"],iframe')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(googleRequests).toEqual([]);
      if (department === 'MAIN') {
        await expect(card.locator('.leaflet-tile-loaded').first()).toBeVisible();
        await card.screenshot({ path: info.outputPath('inline-map.png'), animations: 'disabled' });
      }
      const urlBefore = page.url();
      await viewMap.click();
      const viewer = page.getByRole('dialog', { name: 'Incident map', exact: true });
      await expect(viewer).toBeVisible();
      await expect(viewer.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
      await expect(viewer.locator('.incident-reference-radius')).toBeVisible();
      await expect(page.locator('.leaflet-container')).toHaveCount(1);
      const viewerBounds = await viewer.boundingBox();
      expect(viewerBounds!.x).toBeGreaterThanOrEqual(0);
      expect(viewerBounds!.x + viewerBounds!.width).toBeLessThanOrEqual(width);
      await expectZoomAndPan(page, viewer.locator('.leaflet-container'));
      expect(page.url()).toBe(urlBefore);
      expect(page.context().pages()).toHaveLength(1);
      await expect(page.locator('a[href*="google.com/maps"],iframe')).toHaveCount(0);
      expect(googleRequests).toEqual([]);
      if (department === 'MAIN') await viewer.screenshot({ path: info.outputPath('in-app-map.png'), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
      await expect(viewMap).toBeFocused();
      await expect(card.locator('.incident-reference-radius')).toBeVisible();
      await expect(page.locator('.leaflet-container')).toHaveCount(1);
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
    await card.getByRole('button', { name: 'View map', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Incident map', exact: true });
    await expect(viewer.locator('.incident-reference-radius')).toBeVisible();
    await expect(viewer.locator('.leaflet-marker-icon')).toHaveCount(1);
    await expect(viewer.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
    expect(page.context().pages()).toHaveLength(1);
    if (dark) await viewer.screenshot({ path: info.outputPath('citizen-in-app-map.png'), animations: 'disabled' });
    await viewer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(viewer).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'View map', exact: true })).toHaveCount(0);
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
  const expectTileZoom = async (zoom: number) => {
    // At wide zoom the existing Cordova bounds can shift the view; a report
    // can then lie outside the SVG viewport when zooming back in. Loaded OSM
    // tile levels observe completed zoom without inventing a fixed center.
    await expect.poll(() => map.locator('.leaflet-tile-container').evaluateAll(levels => {
      // Leaflet retains lower-priority background levels after animation.
      // GridLayer gives the current level the highest inline z-index.
      const current = levels.sort((a, b) => Number((b as HTMLElement).style.zIndex) - Number((a as HTMLElement).style.zIndex))[0];
      return current ? [...new Set([...current.querySelectorAll<HTMLImageElement>('.leaflet-tile-loaded')]
        .map(tile => Number(new URL(tile.src).pathname.split('/')[1])))] : [];
    })).toEqual([zoom]);
  };
  await expectTileZoom(16);
  for (let zoom = 15; zoom >= 12; zoom--) {
    await map.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expectTileZoom(zoom);
    await expect(map.locator('.leaflet-map-pane')).not.toHaveClass(/leaflet-zoom-anim/);
    await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
  }
  await expect(map.getByRole('button', { name: 'Zoom out', exact: true })).toHaveAttribute('aria-disabled', 'true');
  for (let zoom = 13; zoom <= 18; zoom++) {
    await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expectTileZoom(zoom);
    await expect(map.locator('.leaflet-map-pane')).not.toHaveClass(/leaflet-zoom-anim/);
    await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
  }
  await expect(map.getByRole('button', { name: 'Zoom in', exact: true })).toHaveAttribute('aria-disabled', 'true');
  // Leaflet's existing keyboard focus brings an off-screen recorded marker
  // into view; this is viewer navigation, not a location edit.
  await map.getByTitle('Emergency location pin', { exact: true }).focus();
  await expectPinOnRadius(map);
  await map.getByTitle('Emergency location pin', { exact: true }).click();
  await expect(map.getByText('Reported Location', { exact: true })).toBeVisible();
  await expectPinOnRadius(map);
  await expect(card.locator('span.tabular-nums')).toHaveText('10.252191, 123.949475');
  await expect(map.locator('.leaflet-popup').getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
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
    await expect(map.locator('.leaflet-map-pane')).not.toHaveClass(/leaflet-zoom-anim/);
    await expectPinOnRadius(map);
    await expect(card.getByText('10.252191, 123.949475', { exact: true })).toBeVisible();
    await session.detach();
  });
});

test('the open map viewer is removed when the admin session ends', async ({ page }) => {
  await fixture(page, 'MEDICAL');
  await page.goto('/admin/medical-dashboard');
  const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'View map', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Incident map', exact: true });
  await expect(viewer.locator('.incident-reference-radius')).toBeVisible();
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { message: 'Synthetic signed-out fixture' } }));
  await page.evaluate(() => {
    localStorage.removeItem('user');
    localStorage.setItem('emergency-logout-epoch', 'synthetic-map-ended');
    window.dispatchEvent(new StorageEvent('storage', { key: 'emergency-logout-epoch', newValue: 'synthetic-map-ended' }));
  });
  await expect(viewer).toHaveCount(0);
  await expect(page.locator('.incident-reference-radius,.nearby-report-dot')).toHaveCount(0);
});

for (const width of [390, 1280]) for (const department of ['MEDICAL', 'MAIN']) {
  test(`${department} flag stays above the inline map at ${width}px`, async ({ page }, info) => {
    // Do not rely on the report-card entrance animation creating a temporary
    // stacking context. Reduced-motion users need the same dialog protection.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    const { incident } = await fixture(page, department);
    const sourceUrl = 'http://localhost:8000/api/attachments/v1/layer-photo/content';
    await page.route('**/api/incidents/v1/map-incident', route => route.fulfill({ json: { data: { incident: {
      ...incident, attachments: [{ attachmentId: 'layer-photo', fileUrl: sourceUrl, fileType: 'image/png', fileName: 'synthetic-layer-photo.png' }],
    } } } }));
    await page.route('**/api/attachments/v1/layer-photo/access-url', route => route.fulfill({ json: {
      data: { url: 'https://res.cloudinary.com/map-layer-fixture/layer.svg', expiresInSeconds: 60 },
    } }));
    await page.route('https://res.cloudinary.com/map-layer-fixture/**', route => route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e9eee9"/><text x="40" y="300" font-size="32">SYNTHETIC LAYER TEST PHOTO</text></svg>',
    }));
    await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
    const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
    const map = card.locator('.leaflet-container');
    // The inline map is lazy: reveal its card before locating the map itself.
    await card.scrollIntoViewIfNeeded();
    await map.scrollIntoViewIfNeeded();
    await expect(map.locator('.incident-reference-radius')).toBeVisible();
    await expect(card.getByRole('group', { name: 'Incident location map', exact: true })).toHaveCSS('isolation', 'isolate');
    const trigger = page.getByRole('button', { name: department === 'MAIN' ? 'Review / manage report' : 'Flag suspected false report', exact: true });
    await trigger.click();
    const review = page.getByRole('dialog', { name: department === 'MAIN' ? 'Review and manage report' : 'Flag a suspected false report', exact: true });
    await expect(review.getByRole('button', { name: 'View photo →', exact: true })).toBeVisible();
    // A visibility assertion alone misses Leaflet panes drawn above the dialog.
    const coverage = () => map.evaluate(element => {
      const box = element.getBoundingClientRect();
      let checked = 0;
      const uncovered: { x: number; y: number; tag: string }[] = [];
      for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fy of [0.1, 0.5, 0.9]) {
        const x = box.x + box.width * fx, y = box.y + box.height * fy;
        if (x <= 0 || y <= 0 || x >= innerWidth || y >= innerHeight) continue;
        checked++;
        const top = document.elementFromPoint(x, y);
        if (!top?.closest('.motion-dialog-backdrop')) uncovered.push({ x, y, tag: top?.tagName ?? 'NONE' });
      }
      return { checked, uncovered };
    });
    await page.screenshot({ path: info.outputPath('map-behind-review.png'), animations: 'disabled' });
    await expect.poll(async () => (await coverage()).uncovered).toEqual([]);
    expect((await coverage()).checked).toBeGreaterThan(0);
    if (department !== 'MAIN') {
      const reason = review.getByLabel('Why do you suspect this report is false?', { exact: true });
      await reason.fill('Synthetic display check only; do not submit this review.');
      await expect(reason).toHaveValue('Synthetic display check only; do not submit this review.');
    }
    await review.getByRole('button', { name: 'View photo →', exact: true }).click();
    const photo = page.getByRole('dialog', { name: 'Report photo', exact: true });
    await expect(photo.getByAltText('Report evidence for review')).toBeVisible();
    await expect.poll(() => photo.getByAltText('Report evidence for review').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: info.outputPath('photo-above-review-and-map.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(photo).toHaveCount(0);
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(card.locator('.incident-reference-radius')).toBeVisible();
  });
}
