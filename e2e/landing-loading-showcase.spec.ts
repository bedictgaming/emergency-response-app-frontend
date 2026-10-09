import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function mock(page: Page, path = '/', slow = false) {
 const user = { id: 'showcase-synthetic', name: 'Demo citizen', email: 'demo@example.test',
   role: path.startsWith('/admin') ? 'ADMIN' : path.startsWith('/responder') ? 'RESPONDER' : 'USER', status: 'ACTIVE',
   department: path.includes('-dashboard') ? path.split('/')[2].split('-')[0].toUpperCase() : 'MAIN', isMainAdmin: !path.includes('-dashboard') || path.includes('main-dashboard') };
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 await page.addInitScript(user => {
   localStorage.setItem('user', JSON.stringify(user));
   class Stream extends EventTarget { close() {} }
   Object.assign(window, { EventSource: Stream });
   Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
     getCurrentPosition(_success: unknown, error: (value: unknown) => void) { error({ code: 1, message: 'Synthetic permission denied' }); },
     watchPosition() { return 1; }, clearWatch() {},
   } });
 }, user);
 await page.route('**/api/**', async route => {
   if (route.request().method() !== 'GET') return route.fulfill({ status: 403, json: { message: 'Synthetic tests forbid mutations' } });
   if (slow && !route.request().url().includes('/auth/v1/me')) await gate;
   return route.fulfill({ json: { data: { user, incidents: [], alerts: [], tasks: [], users: [], units: [], resources: [], responders: [], barangays: [], types: [], flags: [], items: [],
     pagination: { page: 1, limit: 50, pages: 1, total: 0, totalPages: 1 }, summary: { total: 0, active: 0, resolved: 0 },
     incidentsByBarangay: { totalIncidents: 0, rankings: [] }, incidentsByType: { totalIncidents: 0, distribution: [] },
     resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 0, resolvedThisMonth: 0, activeThisMonth: 0, resolutionRate: 0, totalHistorical: 0, totalResolvedAllTime: 0 },
   } } });
 });
 await page.route('https://**', route => route.abort());
 return release;
}

for (const width of [320, 390, 768, 1024, 1440]) for (const theme of ['light', 'dark']) {
 test(`landing dashboard preview and footer fit ${width} in ${theme}`, async ({ page }, info) => {
   const errors: string[] = [];
   page.on('pageerror', error => errors.push(error.message));
   await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
   await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
   await mock(page);
   await page.goto('/');
   const preview = page.getByRole('region', { name: 'Your emergency report, in one place.' });
   const image = preview.getByRole('img');
   await expect(image).toHaveAttribute('src', '/images/citizen-dashboard-preview.png');
   await expect(image).toHaveAttribute('loading', 'lazy');
   await expect(preview.getByText(/Demonstration data/)).toBeVisible();
   await preview.scrollIntoViewIfNeeded();
   await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1440);
   const notice = preview.getByText(/Demonstration data/);
   const deviceBase = await preview.locator('[data-macbook-base]').boundingBox();
   const noticeBox = await notice.boundingBox();
   expect(deviceBase!.y + deviceBase!.height + 12).toBeLessThanOrEqual(noticeBox!.y);
   await notice.scrollIntoViewIfNeeded();
   expect(await notice.evaluate(element => {
     const rect = element.getBoundingClientRect();
     const hits = document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
     return hits[0] === element;
   })).toBe(true);
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   const box = await image.boundingBox();
   expect(box!.x).toBeGreaterThanOrEqual(0);
   expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
   const footer = page.locator('[data-wave-footer]');
   await footer.scrollIntoViewIfNeeded();
   await expect(footer.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911');
   await expect(footer.locator('input,form,button')).toHaveCount(0);
   for (const link of await footer.getByRole('link').all()) {
     expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
     await link.focus();
     await expect(link).toBeFocused();
   }
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   if ([390, 1440].includes(width)) {
     await page.evaluate(() => document.fonts.ready);
     await footer.scrollIntoViewIfNeeded();
     await page.waitForTimeout(450); // Let the scroll-responsive header settle before evidence capture.
     await page.screenshot({ path: info.outputPath(`footer-${width}-${theme}.png`) });
     await page.evaluate(() => window.scrollTo(0, 0));
     await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
     await page.waitForTimeout(450);
     await page.screenshot({ path: info.outputPath(`landing-${width}-${theme}.png`), fullPage: true });
     await preview.scrollIntoViewIfNeeded();
     await image.evaluate(element => (element as HTMLImageElement).decode());
     await page.waitForTimeout(450); // Allow bounded lid motion and composited image paint to settle.
     await preview.screenshot({ path: info.outputPath(`preview-${width}-${theme}.png`) });
   }
   expect(errors).toEqual([]);
 });
}
test('wave footer stays landing-only and reduced motion is static', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await mock(page);
 await page.goto('/');
 const footer = page.locator('[data-wave-footer]');
 await footer.scrollIntoViewIfNeeded();
 expect(await footer.locator('svg[viewBox="0 0 3600 500"]').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
 await page.goto('/login');
 await expect(page.locator('[data-wave-footer]')).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Log In', exact: true }).last()).toBeVisible();
});
for (const path of ['/', '/dashboard', '/admin/main-dashboard', '/admin/fire-dashboard', '/admin/medical-dashboard', '/admin/police-dashboard', '/admin/drrmo-dashboard', '/admin/users', '/admin/analytics', '/admin/barangay-history', '/admin/operations']) {
 test(`real loading skeleton resolves on ${path}`, async ({ page }, info) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.emulateMedia({ reducedMotion: 'reduce' });
   const release = await mock(page, path, true);
   await page.goto(path);
   await expect(page.locator('[data-loader-skeleton]').first()).toBeVisible();
   await expect(page.locator('[data-skeleton-shimmer]')).toHaveCount(0);
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   if (path === '/dashboard') {
     await expect(page.getByRole('link', { name: 'Call 911 for emergency help' })).toBeVisible();
     await expect(page.getByRole('button', { name: 'Report a fire emergency' })).toBeVisible();
     await page.screenshot({ path: info.outputPath('citizen-loading-mobile.png'), fullPage: true });
   }
   release();
   await expect(page.locator('[data-loader-skeleton]')).toHaveCount(0);
 });
}
test('shimmer and wave move only while visible and motion is allowed', async ({ page }) => {
 const release = await mock(page, '/', true);
 await page.goto('/');
 const footer = page.locator('[data-wave-footer]');
 expect(await footer.locator('svg[viewBox="0 0 3600 500"]').evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused');
 await page.getByRole('heading', { name: 'Public safety advisories' }).scrollIntoViewIfNeeded();
 await expect(page.locator('[data-skeleton-shimmer]').first()).toBeVisible();
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(page.locator('[data-skeleton-shimmer]')).toHaveCount(0);
 await page.emulateMedia({ reducedMotion: 'no-preference' });
 await footer.scrollIntoViewIfNeeded();
 await expect.poll(() => footer.locator('svg[viewBox="0 0 3600 500"]').evaluate(element => getComputedStyle(element).animationPlayState)).toBe('running');
 release();
});
