import { expect, test, type Page, type Route } from '@playwright/test';

// Synthetic, clearly labeled image. No hosted reports/evidence are used.
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#eeeeea"/><text x="600" y="400" text-anchor="middle" font-family="sans-serif" font-size="56" fill="#1c2329">TEST PHOTO — NOT AN EMERGENCY</text></svg>';
const sourceUrl = 'http://localhost:8000/api/attachments/v1/viewer-photo/content';

async function fixture(page: Page, department?: string) {
  const user = {
    id: 'viewer-user', name: 'Test User', email: 'viewer@example.test',
    role: department ? 'ADMIN' : 'USER',
    ...(department && { department, isMainAdmin: department === 'MAIN' }),
  };
  const service = department === 'DRRMO' ? 'HAZARD' : department && department !== 'MAIN' ? department : 'FIRE';
  const incident = {
    incidentId: 'viewer-incident', title: 'Synthetic viewer report', description: 'Synthetic report for local photo viewer testing only.',
    typeId: 'viewer-type', locationId: 'viewer-location', severityLevel: 'HIGH',
    status: 'RESOLVED', verificationStatus: 'VERIFIED', requestedServices: [service],
    reportedBy: user.id, reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    type: { typeId: 'viewer-type', typeName: service === 'HAZARD' ? 'Hazard' : service.charAt(0) + service.slice(1).toLowerCase() },
    location: { locationId: 'viewer-location', locationName: 'Synthetic location' },
    serviceResponses: [{ service, status: 'RESOLVED' }], incidentUnits: [], reviewFlags: [],
    attachments: [{ attachmentId: 'viewer-photo', fileName: 'test.svg', fileType: 'image/png', fileUrl: sourceUrl, uploadedAt: new Date().toISOString() }],
  };
  await page.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), user);
  await page.route('**/api/**', route => route.fulfill({ json: { data: { user, incidents: [incident], alerts: [], reviewFlags: [] } } }));
  const state = { requests: 0, deny: false, failImage: false, delay: undefined as undefined | ((route: Route) => Promise<void>) };
  await page.route('**/api/attachments/v1/viewer-photo/access-url', async route => {
    state.requests += 1;
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers()['x-auth-scope']).toBeUndefined();
    if (state.delay) return state.delay(route);
    if (state.deny) return route.fulfill({ status: 403, json: { code: 403, status: 'error', message: 'Not authorized' } });
    return route.fulfill({ json: { data: { url: `https://res.cloudinary.com/viewer-test/photo-${state.requests}.svg`, expiresInSeconds: 60 } } });
  });
  await page.route('https://res.cloudinary.com/viewer-test/**', route => state.failImage
    ? route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"unavailable"}' })
    : route.fulfill({ contentType: 'image/svg+xml', body: image }));
  const pathname = department ? `/admin/${department === 'MAIN' ? 'main' : department.toLowerCase()}-dashboard` : '/dashboard';
  // This is deliberately a public history entry, not an automatic session restore.
  await page.goto('/?session=manual');
  await page.goto(pathname);
  if (department && department !== 'MAIN') await page.getByRole('button', { name: 'Resolved (1)' }).click();
  // Photos are deliberately lazy: scroll the card into view on narrow phones.
  await page.getByText('Photo attached', { exact: true }).first().scrollIntoViewIfNeeded();
  const trigger = page.getByRole('button', { name: 'View photo →' }).first();
  await expect(trigger).toBeVisible();
  await expect.poll(() => state.requests).toBe(1);
  // Requests being issued does not mean the thumbnail has finished decoding.
  // Failure tests must change only the later viewer response, not this image.
  await expect.poll(() => page.locator('img[src="https://res.cloudinary.com/viewer-test/photo-1.svg"]').evaluate(element => {
    const photo = element as HTMLImageElement;
    return photo.complete && photo.naturalWidth > 0;
  })).toBe(true);
  return { state, trigger, pathname, incident };
}

test('citizen photo opens in-app, closes repeatedly and browser Back closes only the viewer', async ({ page, context }) => {
  const { state, trigger, pathname } = await fixture(page);
  const initialHistory = await page.evaluate(() => history.length);
  const initialPages = context.pages().length;
  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click();
    const viewer = page.getByRole('dialog', { name: 'Report photo' });
    await expect(viewer.getByAltText('Incident Photo Evidence')).toHaveAttribute('src', `https://res.cloudinary.com/viewer-test/photo-${attempt + 2}.svg`);
    await expect.poll(() => page.evaluate(() => Boolean(history.state.emergencyEvidenceViewer))).toBe(true);
    expect(context.pages()).toHaveLength(initialPages);
    await expect(viewer.locator('a')).toHaveCount(0);
    if (attempt === 1) await page.goBack();
    else await viewer.getByRole('button', { name: 'Close photo' }).click();
    await expect(viewer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${pathname}$`));
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  }
  expect(state.requests).toBe(4);
  expect(await page.evaluate(() => history.length)).toBe(initialHistory + 1); // Forward entry is reused, not stacked.
  await page.goBack();
  await expect(page).toHaveURL(/\/\?session=manual$/);
});

for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`${department} admin photo stays in-app and Escape restores the dashboard`, async ({ page, context }) => {
    const { trigger, pathname } = await fixture(page, department);
    const initialPages = context.pages().length;
    await page.getByRole('button', { name: 'View attached photo' }).first().click();
    const viewer = page.getByRole('dialog', { name: 'Report photo' });
    await expect(viewer.getByRole('img')).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(viewer.getByRole('button', { name: 'Close photo' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${pathname}$`));
    expect(context.pages()).toHaveLength(initialPages);
    await expect(trigger).toBeVisible();
  });
}

test('denied fresh photo authorization stays closable and retry requests access again', async ({ page }) => {
  const { state, trigger } = await fixture(page);
  state.deny = true;
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  await expect(viewer.getByText('The photo could not be loaded. Your report remains available.')).toBeVisible();
  await expect(viewer.locator('img')).toHaveCount(0);
  state.deny = false;
  await viewer.getByRole('button', { name: 'Retry photo' }).click();
  await expect(viewer.getByAltText('Incident Photo Evidence')).toBeVisible();
  expect(state.requests).toBe(3);
  await viewer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('provider image failure stays in-app with a fresh retry and Close control', async ({ page }) => {
  const { state, trigger } = await fixture(page);
  state.failImage = true;
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  await expect(viewer.getByText('The photo could not be loaded. Your report remains available.')).toBeVisible();
  state.failImage = false;
  await viewer.getByRole('button', { name: 'Retry photo' }).click();
  await expect(viewer.getByAltText('Incident Photo Evidence')).toBeVisible();
  expect(state.requests).toBe(3);
  await viewer.getByRole('button', { name: 'Close photo' }).click();
  await expect(viewer).toHaveCount(0);
});

test('closing during loading ignores a late photo response', async ({ page }) => {
  const { state, trigger } = await fixture(page);
  let held: Route | undefined;
  state.delay = async route => { held = route; };
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  await expect(viewer.getByText('Loading secure photo…')).toBeVisible();
  await expect.poll(() => Boolean(held)).toBe(true);
  await viewer.getByRole('button', { name: 'Close photo' }).click();
  await expect(viewer).toHaveCount(0);
  await held!.fulfill({ json: { data: { url: 'https://res.cloudinary.com/viewer-test/late.svg', expiresInSeconds: 60 } } });
  await expect(viewer).toHaveCount(0);
  await expect(trigger).toBeVisible();
});

test('photo viewer fits the viewport and returns focus and scroll without navigation', async ({ page }, testInfo) => {
  // Measure settled layout, not a fractional frame of the dialog's scale-in.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { trigger } = await fixture(page);
  await trigger.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  const photo = viewer.getByAltText('Incident Photo Evidence');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const viewport = page.viewportSize()!;
  for (const control of [viewer, photo, viewer.getByRole('button', { name: 'Close photo' })]) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  const closeBox = (await viewer.getByRole('button', { name: 'Close photo' }).boundingBox())!;
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('in-app-photo-viewer.png') });
  await viewer.getByRole('button', { name: 'Close photo' }).click();
  await expect(viewer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(Math.abs((await page.evaluate(() => scrollY)) - scrollBefore)).toBeLessThanOrEqual(1);
});

test('nested report-review photo closes alone and leaves the review dialog usable', async ({ page }) => {
  const { incident } = await fixture(page, 'MAIN');
  await page.route('**/api/incidents/v1/viewer-incident', route => route.fulfill({ json: { data: { incident } } }));
  await page.getByRole('button', { name: 'Review / manage report' }).click();
  const review = page.getByRole('dialog', { name: 'Review and manage report' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'View photo →' }).click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  await expect(viewer.getByAltText('Report evidence for review')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'View photo →' })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await review.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(review).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('account change closes private photo inspection and discards its late response', async ({ page }) => {
  const { state, trigger } = await fixture(page);
  let held: Route | undefined;
  state.delay = async route => { held = route; };
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  await expect(viewer.getByText('Loading secure photo…')).toBeVisible();
  await expect.poll(() => Boolean(held)).toBe(true);
  await page.evaluate(() => {
    const oldValue = localStorage.getItem('user');
    const newValue = JSON.stringify({ id: 'other-user', role: 'USER' });
    localStorage.setItem('user', newValue);
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', oldValue, newValue }));
  });
  await expect(viewer).toHaveCount(0);
  await held!.fulfill({ json: { data: { url: 'https://res.cloudinary.com/viewer-test/old-account.svg', expiresInSeconds: 60 } } });
  await expect(page.locator('img[src$="old-account.svg"]')).toHaveCount(0);
});

test('restricted history still permits closing the photo without external navigation', async ({ page }) => {
  const { trigger } = await fixture(page);
  await page.evaluate(() => { history.pushState = () => { throw new DOMException('History disabled', 'SecurityError'); }; });
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  await expect(viewer.getByRole('img')).toBeVisible();
  await viewer.getByRole('button', { name: 'Close photo' }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('backdrop dismissal consumes only the viewer entry and keeps private URLs out of history', async ({ page }) => {
  const { trigger } = await fixture(page);
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Report photo' });
  await expect(viewer.getByRole('img')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(history.state.emergencyEvidenceViewer))).toBe(true);
  const state = await page.evaluate(() => JSON.stringify(history.state));
  expect(state).not.toContain('cloudinary');
  expect(state).not.toContain('viewer-photo');
  await page.mouse.click(2, 2);
  await expect(viewer).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(trigger).toBeFocused();
});
