import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const longReference = 'SyntheticReference'.repeat(6);
const routes = ['/', '/login', '/dashboard', ...['main', 'fire', 'medical', 'police', 'drrmo'].map(role => `/admin/${role}-dashboard`), '/admin/users', '/admin/analytics', '/admin/barangay-history', '/admin/operations'];
const sizes = [{ width: 320, height: 667 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];

async function fixture(page: Page, path: string) {
  const unitRequests: string[] = [];
  page.on('request', request => { if (/\/api\/(units|resources|incident-units)\/|\/incidents\/v1\/[^/]+\/units/.test(new URL(request.url()).pathname)) unitRequests.push(request.url()); });
  const department = path.includes('-dashboard') ? path.split('/')[2].split('-')[0].toUpperCase() : 'MAIN';
  const user = { id: 'responsive-synthetic', name: 'Synthetic mobile layout citizen', email: 'synthetic@example.test', role: path.startsWith('/admin') ? 'ADMIN' : path.startsWith('/responder') ? 'RESPONDER' : 'USER', status: 'ACTIVE', department, isMainAdmin: department === 'MAIN' };
  const incident = { incidentId: 'responsive-incident', title: 'Synthetic fire report beside a community building', description: `Synthetic layout details ${longReference}`, severityLevel: 'HIGH', status: 'ACTIVE', verificationStatus: 'VERIFIED', reportedAt: '2026-10-07T04:00:00Z', reportedBy: user.id, requestedServices: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'], latitude: 10.252191, longitude: 123.949475, type: { typeId: 'fire', typeName: 'Fire Outbreak' }, barangay: { barangayId: 'synthetic-area', name: 'Poblacion', status: 'ACTIVE' }, location: { locationName: 'Synthetic community building', address: 'Synthetic street', latitude: 10.252191, longitude: 123.949475 }, reporter: { ...user, phone: '09123456789' }, attachments: [], incidentUnits: [], serviceResponses: [], reviewFlags: [] };
  const task = { taskId: 'synthetic-task', taskName: 'Synthetic field assignment', description: longReference, priority: 'HIGH', status: 'PENDING', incident };
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-response-theme', 'light');
    class Stream extends EventTarget { close() {} }
    Object.assign(window, { EventSource: Stream });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success: (position: unknown) => void) { success({ coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 25 }, timestamp: Date.now() }); },
      watchPosition(success: (position: unknown) => void) { setTimeout(() => success({ coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 25 }, timestamp: Date.now() }), 0); return 1; }, clearWatch() {},
    } });
  }, user);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    // Every API call is intercepted. No hosted/local database, email, dispatch or notification is contacted.
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403, json: { message: 'Layout fixture forbids mutations' } });
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/incidents/v1/responsive-incident')) return route.fulfill({ json: { data: { incident } } });
    if (path.endsWith('/analytics/v1/dashboard')) return route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 1, topArea: null, rankings: [] }, incidentsByType: { totalIncidents: 1, topType: null, distribution: [] },
      resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 1, resolvedThisMonth: 0, activeThisMonth: 1, resolutionRate: 0, totalHistorical: 1, totalResolvedAllTime: 0 },
    } } });
    return route.fulfill({ json: { data: { user, incidents: [incident], users: [{ ...user, role: 'USER', createdAt: '2026-10-01T00:00:00Z' }], tasks: [task], units: [{ unitId: 'synthetic-unit', unitName: longReference, unitType: 'FIRE', status: 'AVAILABLE' }], resources: [], responders: [], types: [], barangays: [], alerts: [], flags: [], items: [], hasMore: false,
      pagination: { page: 1, limit: 50, total: 1, pages: 1, totalPages: 1 }, summary: { total: 1, active: 1, responding: 0, resolved: 0 }, verifiedSummary: { total: 1, active: 1, responding: 0, resolved: 0 }, serviceSummary: { total: 1, active: 1, responding: 0, resolved: 0 },
    } } });
  });
  await page.route('https://**', route => route.abort());
  return { unitRequests };
}

async function check(page: Page, label: string) {
  const inspect = () => page.evaluate(() => {
    const shown = (element: Element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'; };
    const identify = (element: Element) => element.getAttribute('aria-label') || element.id || element.textContent?.trim().slice(0, 65) || element.tagName;
    const root = document.documentElement;
    const overflow = Array.from(document.querySelectorAll('h1,h2,h3,p,button,input,textarea,select')).filter(element => {
      if (!shown(element)) return false;
      // Dedicated horizontally scrollable tables/toolbars keep their full data, not document-level overflow.
      let parent = element.parentElement;
      while (parent) { if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return false; parent = parent.parentElement; }
      const box = element.getBoundingClientRect();
      return box.right > innerWidth + 1 || box.left < -1;
    }).map(identify);
    const smallTargets = Array.from(document.querySelectorAll('button,select,input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]),a.inline-flex[href^="tel:"]')).filter(element => shown(element) && !element.closest('.leaflet-container') && (element.getBoundingClientRect().height < 43.5 || element.getBoundingClientRect().width < 43.5)).map(identify);
    const smallFields = Array.from(document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),textarea,select')).filter(element => shown(element) && parseFloat(getComputedStyle(element).fontSize) < 16).map(identify);
    return { pageOverflow: root.scrollWidth > root.clientWidth + 1, overflow, smallTargets, smallFields };
  });
  // Dialog scale and incumbent transition-all fields can have smaller
  // intermediate geometry. Assert the settled UI, not the opening frame.
  await expect.poll(inspect, { message: `${label}: settled responsive geometry` }).toMatchObject({
    pageOverflow: false, overflow: [],
    ...(page.viewportSize()!.width < 1024 ? { smallTargets: [], smallFields: [] } : {}),
  });
}

for (const size of sizes) for (const path of routes) {
  test(`${path} fits ${size.width}x${size.height}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    const { unitRequests } = await fixture(page, path);
    // Public layout checks intentionally bypass restoration of the synthetic
    // saved account; otherwise they would measure the citizen dashboard twice.
    await page.goto(['/', '/login'].includes(path) ? path + '?session=manual' : path);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/Loading (operational records|assignments|analytics data|users|incidents)/)).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await check(page, path);
    if (path.includes('-dashboard')) {
      const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
      await map.scrollIntoViewIfNeeded();
      await expect(map.locator('.leaflet-container')).toBeVisible();
      await expect(map.locator('.incident-reference-radius')).toBeVisible();
      await expect(page.getByRole('button', { name: 'View Map', exact: true })).toHaveCount(0);
      await check(page, 'Inline incident map');
      await expect(page.getByRole('button', { name: 'Analytics', exact: true })).toBeVisible();
    }
    if (path === '/admin/operations') {
      await expect(page.getByRole('heading', { name: 'Incident tasks', exact: true, level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add resources', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add units', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Add incident tasks', exact: true }).click();
      await expect(page.getByLabel('Task name', { exact: true })).toBeVisible();
      await check(page, 'Incident task editor');
      expect(unitRequests).toEqual([]);
    }
    if (path === '/admin/users' && size.width < 768) {
      const table = page.getByRole('region', { name: 'User accounts table — scroll horizontally for all controls', exact: true });
      await table.focus();
      await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      await expect(table.getByRole('button', { name: 'Deactivate', exact: true })).toBeInViewport();
      await table.evaluate(element => { element.scrollLeft = 0; });
      expect(await table.getByText('CITIZEN', { exact: true }).evaluate(element => element.clientHeight)).toBeLessThan(44);
    }
    if (process.env.RESPONSIVE_CAPTURE === 'true' && [390, 1440].includes(size.width)) await page.screenshot({ path: info.outputPath('responsive.png'), fullPage: true });
  });
}

for (const size of sizes) {
  test(`report dialog fits ${size.width}x${size.height}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await fixture(page, '/dashboard');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Report a fire emergency' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await check(page, 'Report dialog');
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
    const area = dialog.locator('.dialog-scroll-area');
    await area.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.getByRole('button', { name: /Submit/ }).first()).toBeInViewport();
    if (process.env.RESPONSIVE_CAPTURE === 'true') await page.screenshot({ path: info.outputPath('report-dialog.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    if (process.env.RESPONSIVE_CAPTURE === 'true') await page.screenshot({ path: info.outputPath('dialog-dismissed.png') });
  });
}

for (const size of sizes) {
  test(`department report review dialog fits ${size.width}x${size.height} without unit dispatch`, async ({ page }, info) => {
    await page.setViewportSize(size);
    const { unitRequests } = await fixture(page, '/admin/fire-dashboard');
    await page.goto('/admin/fire-dashboard');
    await expect(page.getByRole('button', { name: 'Dispatch Unit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark as Responding', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Flag suspected false report', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Flag a suspected false report', exact: true });
    await expect(panel.getByLabel('Why do you suspect this report is false?', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Shift+Tab');
    expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await check(page, 'Department report review dialog');
    const area = panel.locator('.dialog-scroll-area');
    await area.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(panel.getByRole('button', { name: 'Send review request', exact: true })).toBeInViewport();
    await expect(panel.getByRole('button', { name: 'Send review request', exact: true })).toBeDisabled();
    if (process.env.RESPONSIVE_CAPTURE === 'true') await page.screenshot({ path: info.outputPath('department-review-dialog.png') });
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Flag suspected false report', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    expect(unitRequests).toEqual([]);
  });
}
