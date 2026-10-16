import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`nearby advisory remains available to ${department} at ${width}px without false-report actions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const user = { id: `synthetic-${department}`, name: 'Synthetic operator', role: 'ADMIN', department, isMainAdmin: department === 'MAIN', status: 'ACTIVE' };
    await page.addInitScript(value => { localStorage.setItem('user', JSON.stringify(value)); }, user);
    const report = { incidentId: '10000000-0000-4000-8000-000000000001', title: 'OTHER Emergency: Synthetic nearby scenario',
      description: 'Synthetic example only; not an emergency.', status: 'RESPONDING', verificationStatus: 'VERIFIED',
      requestedServices: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'], reportedAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z',
      reportedBy: 'synthetic-citizen', type: { typeName: 'Other' }, location: { locationName: 'Synthetic location' },
      serviceResponses: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'].map(service => ({ service, status: 'RESPONDING' })),
      nearbyReportWarning: 'POSSIBLE_DUPLICATE', reviewFlags: [], reviewNotices: [], attachments: [], tasks: [],
    };
    let writes = 0;
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET') writes++;
      if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
      if (path.endsWith('/incidents/v1/attention')) return route.fulfill({ json: { data: { items: [], hasMore: false } } });
      if (path.includes('/incidents/v1/')) return route.fulfill({ json: { data: { incidents: [report], incident: report,
        pagination: { page: 1, limit: 5, total: 1, pages: 1 }, summary: { total: 1, active: 0, responding: 1, resolved: 0 },
        verifiedSummary: { total: 1, active: 0, responding: 1, resolved: 0, services: { fire: 1, medical: 1, police: 1, hazard: 1 } },
      } } });
      return route.fulfill({ json: { data: { items: [], alerts: [] } } });
    });
    const slug = department === 'MAIN' ? 'main' : department === 'DRRMO' ? 'drrmo' : department.toLowerCase();
    await page.goto(`/admin/${slug}-dashboard`);
    const note = page.getByRole('note', { name: 'Nearby report advisory' });
    await expect(note).toContainText('Possible duplicate — assess both reports.');
    await expect(note).toContainText('These may be separate emergencies');
    expect(await note.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await note.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(writes).toBe(0);
    if (department === 'FIRE') await page.screenshot({ path: test.info().outputPath(`nearby-admin-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: department === 'MAIN' ? 'Review / manage report' : 'Flag suspected false report' }).click();
    await expect(page.getByRole('dialog').getByRole('note', { name: 'Nearby report advisory' })).toBeVisible();
    expect(writes).toBe(0);
  });
}
