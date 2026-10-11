import { devices, expect, test, type Page } from '@playwright/test';
import { captureIncidentPhoto, installFakeIncidentCamera } from './helpers/incident-camera';

async function openReport(page: Page) {
  await installFakeIncidentCamera(page);
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
  await expect(page.getByRole('group', { name: /Photo Evidence\s*\(Required\)/ })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
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

    test('all categories offer only camera evidence in light and dark layouts', async ({ page }) => {
      await openReport(page);
      const dialog = page.getByRole('dialog');
      for (const category of ['Fire', 'Medical', 'Police', 'Hazard', 'Other']) {
        await dialog.getByRole('button', { name: category, exact: true }).click();
        await expect(page.getByRole('button', { name: 'Choose photo' })).toHaveCount(0);
        await expect(page.locator('input[type="file"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Use camera', exact: true })).toBeVisible();
      }
      const photoGroup = page.getByRole('group', { name: /Photo Evidence\s*\(Required\)/ });
      await photoGroup.scrollIntoViewIfNeeded();
      const camera = page.getByRole('button', { name: 'Use camera', exact: true });
      expect((await camera.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
        await page.screenshot({ path: test.info().outputPath(`camera-only-${theme}.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await camera.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('group', { name: 'Camera preview', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('cameraStops'))).toBe('1');
    });

    test('unsupported camera offers immediate help and leaves the draft intact', async ({ page }) => {
      await openReport(page);
      await page.evaluate(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: undefined }));
      await page.getByLabel('Description of Incident').fill('Synthetic camera-unavailable check');
      await page.getByRole('button', { name: 'Use camera', exact: true }).click();
      const cameraError = page.getByRole('group', { name: 'Camera preview', exact: true }).getByRole('alert');
      await expect(cameraError).toContainText('Camera access is not available');
      await expect(cameraError.getByRole('link', { name: 'call 911' })).toHaveAttribute('href', 'tel:911');
      await page.getByRole('button', { name: 'Close camera', exact: true }).click();
      await expect(page.getByLabel('Description of Incident')).toHaveValue('Synthetic camera-unavailable check');
      await expect(page.getByRole('button', { name: 'Use camera', exact: true })).toBeVisible();
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
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

    test('contact accepts only digits and stops at eleven while retaining leading zero', async ({ page }) => {
      await openReport(page);
      const contact = page.getByLabel('Contact Number *');
      await expect(contact).toHaveAttribute('name', 'contactNumber');
      await expect(contact).toHaveAttribute('inputmode', 'numeric');
      await expect(contact).toHaveAttribute('maxlength', '11');
      await contact.pressSequentially('abc09def171234567890');
      await expect(contact).toHaveValue('09171234567');
      await contact.fill('');
      await contact.pressSequentially('letters +-.');
      await expect(contact).toHaveValue('');
      await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
      await expect(contact).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#contact-number-error')).toHaveText('Please enter your contact number');
      await contact.fill('09171234567');
      await expect(contact).toHaveAttribute('aria-invalid', 'false');
      await expect(page.locator('#contact-number-error')).toHaveCount(0);
      await contact.locator('..').scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath('contact-number.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (viewport === 'mobile') {
        expect(await contact.evaluate(input => Number.parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
      }
    });

    test('contact paste cleans formatting before its digit limit and preserves unselected digits', async ({ page }) => {
      await openReport(page);
      const contact = page.getByLabel('Contact Number *');
      const paste = async (text: string, start: number, end: number) => {
        await contact.evaluate((node, { text, start, end }) => {
          const input = node as HTMLInputElement;
          input.focus();
          input.setSelectionRange(start, end);
          const clipboardData = new DataTransfer();
          clipboardData.setData('text/plain', text);
          input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
        }, { text, start, end });
      };
      await paste('09 171 234 567 abc 890', 0, 0);
      await expect(contact).toHaveValue('09171234567');
      await paste('abc', 0, 11);
      await expect(contact).toHaveValue('09171234567');
      await paste('88 letters 999', 2, 4);
      await expect(contact).toHaveValue('09881234567');
      await contact.fill('123');
      await expect(contact).toHaveValue('123');
      expect(await contact.evaluate(node => (node as HTMLInputElement).validity.patternMismatch)).toBe(false);
    });

    test('photo group stays named after capturing and removing evidence', async ({ page }) => {
      await openReport(page);
      await captureIncidentPhoto(page);
      await expect(page.getByAltText('Incident evidence preview')).toBeVisible();
      await expectAssociatedLabels(page);
      await page.getByRole('button', { name: 'Remove selected photo' }).click();
      await expect(page.getByAltText('Incident evidence preview')).toHaveCount(0);
      await expectAssociatedLabels(page);
    });
  });
}
