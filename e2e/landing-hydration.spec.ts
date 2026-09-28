import { expect, test } from '@playwright/test';

test('landing page hydrates without server/client markup mismatches', async ({ page }) => {
  const hydrationErrors: string[] = [];
  const recordIfHydrationError = (message: string) => {
    if (/hydration|hydrated but|server rendered HTML didn't match/i.test(message)) {
      hydrationErrors.push(message);
    }
  };

  page.on('console', message => {
    if (message.type() === 'error') recordIfHydrationError(message.text());
  });
  page.on('pageerror', error => recordIfHydrationError(error.message));

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByTestId('report-preparation-icon-tile')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('report-preparation-icon-tile')).toBeVisible();

  expect(hydrationErrors).toEqual([]);
});
