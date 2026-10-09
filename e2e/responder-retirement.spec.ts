import { expect, test } from '@playwright/test';
for (const width of [375, 1365]) {
  test(`operations retains units and admin task updates without responder controls at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const admin = { id: 'synthetic-admin', role: 'ADMIN', name: 'Test Admin', department: 'MAIN', isMainAdmin: true };
    await page.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), admin);
    let status = 'PENDING';
    let updates = 0;
    let retiredRequests = 0;
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes('/responders/') || path.includes('/users/')) retiredRequests++;
      if (path.endsWith('/me')) return route.fulfill({ json: { data: { user: admin } } });
      if (path.includes('/tasks/') && route.request().method() === 'PUT') {
        updates++;
        expect(route.request().postDataJSON()).toEqual({ status: 'IN_PROGRESS' });
        status = 'IN_PROGRESS';
      }
      return route.fulfill({ json: { data: {
        units: [{ unitId: 'unit', unitName: 'Test Fire Unit', unitType: 'FIRE', status: 'AVAILABLE' }],
        resources: [], incidents: [],
        tasks: [{ taskId: 'task', taskName: 'Test scene assessment', status, priority: 'HIGH' }],
      } } });
    });
    await page.goto('/admin/operations');
    await expect(page.getByRole('heading', { name: 'Test Fire Unit', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Responders', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark done', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Test scene assessment' }).click();
    await expect(page.getByLabel('Assigned responder')).toHaveCount(0);
    expect(updates).toBe(1);
    expect(retiredRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`operations-${width}.png`), fullPage: true });
  });
}
test('legacy responder remains visible but cannot be reassigned or granted access', async ({ page }) => {
  const admin = { id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true, permissions: ['user:manage'] };
  await page.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), admin);
  await page.route('**/api/**', route => route.fulfill({ json: { data: {
    user: admin, users: [{ id: 'legacy', role: 'RESPONDER', name: 'Historical personnel', email: 'synthetic@example.test', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z' }],
  } } }));
  await page.goto('/admin/users');
  await expect(page.getByRole('combobox', { name: 'Role for Historical personnel' })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Role for Historical personnel' })).toContainText('Responder (retired)');
});
