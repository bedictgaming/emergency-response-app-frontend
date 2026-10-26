import { expect, test } from '@playwright/test';
import { installQuietEventStream, waitForQuietEventStream } from './helpers/quiet-event-stream';

test.use({ serviceWorkers: 'block' });
for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) for (const width of [375, 1280]) {
  test(`${department} selected first-page tab preserves reports without a redundant read at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await installQuietEventStream(page);
    const user = { id: `synthetic-${department}`, role: 'ADMIN', department, isMainAdmin: department === 'MAIN', status: 'ACTIVE' };
    await page.addInitScript(value => localStorage.setItem('user', JSON.stringify(value)), user);
    let reads = 0, writes = 0;
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace(/\/$/, '');
      if (request.method() !== 'GET') { writes++; return route.fulfill({ status: 403 }); }
      if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user } } });
      if (path === '/api/incidents/v1') {
        reads++;
        const service = department === 'DRRMO' ? 'HAZARD' : department === 'MAIN' ? 'FIRE' : department;
        return route.fulfill({ json: { data: { incidents: [{ incidentId: '10000000-0000-4000-8000-000000000001',
          title: 'Synthetic selected-tab report', description: 'Retained current page, no actual emergency.', status: 'RESPONDING', verificationStatus: 'VERIFIED',
          reportedBy: 'synthetic-citizen', reportedAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z',
          requestedServices: [service], serviceResponses: [{ service, status: 'RESPONDING' }], type: { typeName: service }, attachments: [], reviewFlags: [] }],
          pagination: { page: 1, limit: 5, total: 1, pages: 1 }, summary: { total: 1, active: 0, responding: 1, resolved: 0, falseReports: 0 } } } });
      }
      return route.fulfill({ json: { data: { view: new URL(request.url()).searchParams.get('view'), enabled: false, departmentReviewEnabled: true, canReview: department !== 'MAIN',
        flags: [], items: [], hasMore: false, pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
    });
    await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
    const heading = page.getByRole('heading', { name: 'Synthetic selected-tab report', exact: true });
    await expect(heading).toBeVisible(); await waitForQuietEventStream(page);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const before = reads, selected = page.getByRole('button', { name: `${department === 'MAIN' ? 'All' : 'Responding'} (1)`, exact: true });
    await expect(selected).toHaveAttribute('aria-pressed', 'true'); await selected.click();
    await expect(heading).toBeVisible(); await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(reads).toBe(before); expect(writes).toBe(0);
    if ((department === 'MAIN' && width === 1280) || (department === 'FIRE' && width === 375))
      await page.screenshot({ path: info.outputPath(`selected-tab-${department}-${width}.png`) });
  });
}
