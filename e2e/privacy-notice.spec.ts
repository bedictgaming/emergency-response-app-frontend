import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function anonymous(page: Page, theme = 'light') {
  const requests: string[] = [];
  await page.addInitScript(value => { localStorage.clear(); localStorage.setItem('emergency-response-theme', value); }, theme);
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', route => { requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`); return route.fulfill({ status: 401, json: { message: 'Synthetic anonymous session' } }); });
  return requests;
}

for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
  test(`draft privacy notice is public and readable at ${width}px in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests = await anonymous(page, theme); await page.goto('/privacy');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Privacy notice', exact: true })).toBeVisible();
    await expect(main.getByText('Cordova Public College capstone project team', { exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'benedictmequiabas@gmail.com', exact: true }).first()).toHaveAttribute('href', 'mailto:benedictmequiabas@gmail.com');
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(main.getByText(/currently enabled only in protected local development/)).toBeVisible();
    await expect(main.getByText(/No new deletion period or deletion job is approved/)).toBeVisible();
    await expect(main.getByText(/Reading this notice does not switch it on/)).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Capstone demonstration notice' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(requests).toEqual([]);
    // Capture from the document top, with all sections rendered, not a hash target.
    await page.screenshot({ path: info.outputPath(`privacy-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
    const retention = main.getByRole('navigation', { name: 'Privacy notice sections' }).getByRole('link', { name: 'Retention', exact: true });
    await retention.focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/privacy#retention$/);
    await expect(main.getByRole('heading', { name: 'Retention and unfinished decisions' })).toBeInViewport();
    expect(page.context().pages()).toHaveLength(1); expect(requests).toEqual([]);
  });
}

for (const width of [1280, 390]) {
  test(`login has a real draft link without claiming agreement at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const requests = await anonymous(page);
    await page.goto('/login?session=manual');
    await expect(page.getByText('By continuing, you agree to our Terms of Service and Privacy Policy', { exact: true })).toHaveCount(0);
    const link = page.getByRole('link', { name: 'Privacy notice (draft)', exact: true }).last();
    await expect(link).toHaveAttribute('href', '/privacy'); await expect(page.getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
    await expect(page.getByText(/Municipal Government of Cordova/)).toHaveCount(0);
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('Cordova Public College capstone project team.');
    await page.screenshot({ path: info.outputPath(`login-privacy-${width}.png`), fullPage: true, animations: 'disabled' });
    await footer.scrollIntoViewIfNeeded();
    await footer.screenshot({ path: info.outputPath(`login-footer-${width}.png`), animations: 'disabled' });
    await link.click(); await expect(page.getByRole('heading', { name: 'Privacy notice', exact: true })).toBeVisible();
    expect(requests.every(request => request.startsWith('GET '))).toBe(true);
  });

  test(`settings exposes privacy without changing sign-in methods at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const requests = await anonymous(page);
    const user = { id: 'privacy-synthetic-citizen', role: 'USER', status: 'ACTIVE', email: 'synthetic@example.invalid', name: 'Synthetic citizen' };
    await page.addInitScript(value => { localStorage.setItem('user', JSON.stringify(value)); }, user);
    await page.route('**/api/**', route => {
      requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ json: { data: { user, accountId: user.id, password: true, google: { connected: false }, canUnlinkGoogle: false } } });
    });
    await page.goto('/settings');
    await expect(page.getByText('Signed in as', { exact: false })).toBeVisible();
    const section = page.getByRole('region', { name: 'Privacy and demo information' });
    await expect(section.getByRole('link', { name: 'Privacy notice (draft)', exact: true })).toHaveAttribute('href', '/privacy');
    await page.screenshot({ path: info.outputPath(`settings-privacy-${width}.png`), fullPage: true, animations: 'disabled' });
    await section.getByRole('link', { name: 'Privacy notice (draft)', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Privacy notice', exact: true })).toBeVisible();
    expect(requests.every(request => request.startsWith('GET '))).toBe(true);
  });
}

test.describe('server-rendered notice', () => {
  test.use({ javaScriptEnabled: false });
  test('privacy text and contact remain readable without JavaScript or login', async ({ page }) => {
    await page.route(/^https:\/\//, route => route.abort()); await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy notice', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Questions and privacy requests', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'benedictmequiabas@gmail.com', exact: true }).first()).toHaveAttribute('href', 'mailto:benedictmequiabas@gmail.com');
  });
});
