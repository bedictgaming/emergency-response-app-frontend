import { expect, test } from '@playwright/test';

test('landing workflow motion is brief and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const firstStep = page.locator('.motion-workflow-step').first();
  await expect(firstStep).toBeVisible();
  expect(await firstStep.evaluate((element) => getComputedStyle(element).animationName)).toBe('workflow-handoff');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await firstStep.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(page.getByRole('link', { name: 'Report an emergency' })).toBeVisible();
});

test('report dialog motion never hides the form and has a reduced-motion path', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', name: 'Citizen', role: 'USER' }));
  });
  await page.route('**/api/**', (route) => {
    const section = new URL(route.request().url()).pathname.split('/')[2];
    return route.fulfill({ json: { data: { [section]: [], user: { id: 'citizen', name: 'Citizen', role: 'USER' } } } });
  });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe('report-panel-in');
  await expect(dialog.getByRole('button', { name: 'Medical' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});
