import { devices, expect, test, type Page } from '@playwright/test';

async function openReport(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'label-citizen', name: 'Label Test', role: 'USER' }));
  });
  await page.route('**/api/**', route => {
    const section = new URL(route.request().url()).pathname.split('/')[2];
    return route.fulfill({ json: { data: { [section]: [], user: { id: 'label-citizen', name: 'Label Test', role: 'USER' } } } });
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: {} }));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function expectAssociatedLabels(page: Page) {
  const unassociated = await page.getByRole('dialog').locator('label').evaluateAll(labels =>
    labels.filter(label => !(label as HTMLLabelElement).control).map(label => label.textContent?.trim()),
  );
  expect(unassociated).toEqual([]);
  await expect(page.getByLabel(/Photo Evidence\s*\(Required\)/)).toHaveAttribute('type', 'file');
}

for (const viewport of ['desktop', 'mobile'] as const) {
  test.describe(`${viewport} incident form labels`, () => {
    if (viewport === 'mobile') {
      const pixel = devices['Pixel 7'];
      test.use({ viewport: pixel.viewport, userAgent: pixel.userAgent, deviceScaleFactor: pixel.deviceScaleFactor, isMobile: pixel.isMobile, hasTouch: pixel.hasTouch });
    }

    test('each label has a control and category choices have a named group', async ({ page }) => {
      await openReport(page);
      await expectAssociatedLabels(page);
      await expect(page.getByRole('group', { name: 'Emergency Category *', exact: true })).toBeVisible();
      await page.getByRole('dialog').locator('label[for="contactNumber"]').click();
      await expect(page.getByLabel('Contact Number *')).toBeFocused();
      await page.screenshot({ path: test.info().outputPath('incident-form-labels.png'), fullPage: true });
    });

    test('multi-service heading names the checkbox group without an orphan label', async ({ page }) => {
      await openReport(page);
      await page.getByRole('dialog').getByRole('button', { name: 'Other', exact: true }).click();
      await expectAssociatedLabels(page);
      const services = page.getByRole('group', { name: 'Response services needed *', exact: true });
      await expect(services).toBeVisible();
      await expect(services.getByRole('checkbox')).toHaveCount(4);
      await services.getByLabel('Fire / BFP response', { exact: true }).check();
      await expect(services.getByLabel('Fire / BFP response', { exact: true })).toBeChecked();
    });

    test('photo label stays associated after selecting and removing evidence', async ({ page }) => {
      await openReport(page);
      await page.getByLabel(/Photo Evidence\s*\(Required\)/).setInputFiles({
        name: 'label-test.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
      });
      await expect(page.getByAltText('Incident evidence preview')).toBeVisible();
      await expectAssociatedLabels(page);
      await page.getByRole('button', { name: 'Remove selected photo' }).click();
      await expect(page.getByAltText('Incident evidence preview')).toHaveCount(0);
      await expectAssociatedLabels(page);
    });
  });
}
