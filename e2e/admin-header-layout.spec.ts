import { expect, test, type Page } from '@playwright/test';

const admins = [
  ['main', 'MAIN'], ['fire', 'FIRE'], ['medical', 'MEDICAL'],
  ['police', 'POLICE'], ['drrmo', 'DRRMO'],
] as const;

async function setup(page: Page, route: string, department: string, saved = true) {
  let failure = false;
  await page.addInitScript(({ department, saved }) => {
    const user = { id: 'layout-admin', role: 'ADMIN', status: 'ACTIVE', department, isMainAdmin: department === 'MAIN' };
    localStorage.setItem('user', JSON.stringify(user));
    if (saved) localStorage.setItem(`emergency-admin-sound-v1:layout-admin:ADMIN:${department}`, 'enabled');
    class Stream extends EventTarget {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { super(); Object.assign(window, { headerStream: this }); }
      close() {}
    }
    Object.assign(window, { EventSource: Stream });
  }, { department, saved });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user: {
      id: 'layout-admin', name: 'Synthetic layout admin', role: 'ADMIN', status: 'ACTIVE', department, isMainAdmin: department === 'MAIN',
    } } } });
    if (path.endsWith('/incidents/v1/attention')) return route.fulfill({ status: failure ? 503 : 200,
      json: failure ? { message: 'Unavailable' } : { data: { items: [], hasMore: false, scope: department === 'DRRMO' ? 'HAZARD' : department } } });
    return route.fulfill({ json: { data: { incidents: [], flags: [], users: [], units: [], types: [], barangays: [], alerts: [],
      pagination: { page: 1, total: 0, totalPages: 1 }, summary: { total: 0, active: 0, responding: 0, resolved: 0 },
      serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 }, verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 },
    } } });
  });
  await page.goto(`/admin/${route}-dashboard`);
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: saved ? 'Resume sound' : 'Enable sound', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { fail: () => { failure = true; } };
}

async function geometry(page: Page) {
  return page.locator('header').evaluate(header => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom };
    };
    const toolbar = header.querySelector('[data-admin-toolbar]')!;
    return { header: rect(header), title: rect(header.querySelector('h1')!), monitor: rect(header.querySelector('[data-admin-monitor]')!),
      nav: rect(header.querySelector('nav')!), toolbar: rect(toolbar),
      scrollWidth: toolbar.scrollWidth, clientWidth: toolbar.clientWidth,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

for (const width of [1366, 1280, 1024, 768, 375, 320]) {
  for (const [route, department] of admins) {
    test(`shared ${route} header remains stable and reachable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 667 : 900 });
      const state = await setup(page, route, department);
      // Exercise a wider fallback font too: native font metrics differ on CI/phones.
      if (width === 320) await page.addStyleTag({ content: 'body, .figma-shell { font-family: Verdana, sans-serif !important; }' });
      const initial = await geometry(page);
      await expect(page.locator('header')).toHaveAttribute('data-header-frame', 'shared');
      await expect(page.locator('header')).toHaveAttribute('data-pinned', 'true');
      await expect(page.locator('header img[src="/emergency-icon.png"]')).toHaveAttribute('width', '40');
      expect(initial.pageOverflow).toBe(false);
      if (width >= 1280) {
        expect(initial.monitor.y).toBeLessThan(initial.title.bottom);
        expect(initial.nav.y).toBeLessThan(initial.title.bottom);
        expect(initial.scrollWidth).toBeLessThanOrEqual(initial.clientWidth + 1);
      } else {
        expect(initial.toolbar.y).toBeGreaterThanOrEqual(initial.title.bottom);
      }
      await page.evaluate(() => (window as unknown as { headerStream: { onopen: () => void } }).headerStream.onopen());
      await expect(page.getByText('Live connection · queue checked every 20s', { exact: true })).toBeVisible();
      expect((await geometry(page)).header.height).toBe(initial.header.height);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await expect(page.getByText('Offline · alerts cannot be confirmed', { exact: true })).toBeVisible();
      expect((await geometry(page)).header.height).toBe(initial.header.height);
      state.fail();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText(/Alert queue unavailable\. Shown alerts/)).toBeVisible();
      expect((await geometry(page)).header.height).toBe(initial.header.height);
      if (width < 640) {
        for (const name of ['Resume sound', 'Logout', 'Outstanding alerts: 0']) {
          const box = await page.getByRole('button', { name, exact: true }).boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        const warning = page.getByText(/Alert queue unavailable\. Shown alerts/);
        const box = await warning.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(await warning.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      if (width < 1280) {
        const logout = page.getByRole('button', { name: 'Logout', exact: true });
        // Exercise native keyboard traversal, not only programmatic focus.
        const pageY = await page.evaluate(() => scrollY);
        await page.getByRole('link', { name: 'Settings', exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(logout).toBeFocused();
        // Focus scrolls the bounded navigation asynchronously; check its settled
        // geometry rather than a fractional frame of that browser scroll.
        await expect.poll(async () => (await logout.boundingBox())!.x).toBeGreaterThanOrEqual(0);
        await expect.poll(async () => { const box = (await logout.boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(width);
        await page.keyboard.press('Shift+Tab');
        const settings = page.getByRole('link', { name: 'Settings', exact: true });
        await expect(settings).toBeFocused();
        const settingsBox = (await settings.boundingBox())!;
        expect(settingsBox.x).toBeGreaterThanOrEqual(0);
        expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => scrollY)).toBe(pageY);
        await page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true }).focus();
      }
      expect((await geometry(page)).pageOverflow).toBe(false);
      await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
      await expect(page.locator('header')).toHaveAttribute('data-hidden', 'false');
      expect((await page.locator('header').boundingBox())!.y).toBeGreaterThanOrEqual(0);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      if (process.env.DASHBOARD_HEADER_CAPTURE === 'true' && [1366, 1024, 375].includes(width)) {
        await page.locator('header').screenshot({ path: `.impeccable/review/dashboard-header-${route}-${width}.png` });
      }
      if ((route === 'main' && (width === 1366 || width === 375)) || (route === 'fire' && width === 320)) {
        await page.screenshot({ path: test.info().outputPath(`header-${width}.png`) });
      }
    });
  }
}

test('sound opt-in, saved preference and arming do not move the desktop header', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await setup(page, 'main', 'MAIN', false);
  const before = await geometry(page);
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
  expect((await geometry(page)).header.height).toBe(before.header.height);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume sound', exact: true })).toBeVisible();
  expect((await geometry(page)).header.height).toBe(before.header.height);
  await page.getByRole('button', { name: 'Resume sound', exact: true }).click();
  await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
  expect((await geometry(page)).header.height).toBe(before.header.height);
});
