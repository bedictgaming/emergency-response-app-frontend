import { expect, test, type Page } from '@playwright/test';
const id = '10000000-0000-4000-8000-000000000001';
const flagId = '20000000-0000-4000-8000-000000000002';
const version = '2026-10-13T00:00:00.000Z';
const reason = 'The synthetic reporter confirmed this was only a training test.';
async function fixture(page: Page, options: { department?: string; service?: string; cancelled?: boolean; denied?: number } = {}) {
  const main = !options.department;
  const user = { id: 'synthetic-admin', role: 'ADMIN', department: options.department || 'MAIN', isMainAdmin: main };
  await page.addInitScript(value => localStorage.setItem('user', JSON.stringify(value)), user);
  let cancelled = Boolean(options.cancelled), deleted = false;
  const writes: Array<{ path: string; method: string; body: unknown }> = [];
  const service = options.service || 'FIRE';
  const flag = { reviewFlagId: flagId, incidentId: id, department: 'DRRMO', status: 'CONFIRMED', reason,
    reviewNotes: 'Main Admin contacted the synthetic reporter before deciding.', createdAt: version, updatedAt: version };
  const report = () => ({ incidentId: id, title: 'Synthetic disposition fixture — no emergency', description: 'Test report only.',
    status: cancelled ? 'CANCELLED' : 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: [service],
    type: { typeName: service === 'HAZARD' ? 'Hazard' : service }, location: { locationName: 'Synthetic location' },
    reportedAt: version, updatedAt: version, reportedBy: 'synthetic-citizen', reporter: { name: 'Synthetic Citizen' },
    attachments: [], incidentUnits: [], serviceResponses: [{ service, status: cancelled ? 'CANCELLED' : 'RESPONDING' }],
    reviewFlags: main ? [flag] : [], reviewNotices: [flag],
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/events/v1/stream')) return route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n' });
    if (path.endsWith('/attention')) return route.fulfill({ json: { data: { items: [], scope: 'MAIN', hasMore: false } } });
    if (request.method() === 'POST' || request.method() === 'DELETE') {
      writes.push({ path, method: request.method(), body: request.postDataJSON() });
      if (options.denied) return route.fulfill({ status: options.denied, json: { message: options.denied === 409 ? 'The false-report decision changed. Refresh and review it before continuing.' : 'Your session or administrator permissions changed. Refresh or log in again.' } });
      if (path.endsWith('/cancel-confirmed-false')) cancelled = true;
      else if (request.method() === 'DELETE') deleted = true;
      else throw Error('Unexpected operational mutation');
      return route.fulfill({ json: { code: 200, data: { incident: report() } } });
    }
    if (path.endsWith('/review-flags')) return route.fulfill({ json: { data: { flags: cancelled || deleted ? [] : [{ ...flag, incident: report() }], pagination: { page: 1, limit: 20, total: cancelled || deleted ? 0 : 1, pages: cancelled || deleted ? 0 : 1 } } } });
    if (path.includes('/incidents/v1/')) {
      const url = new URL(request.url()), wanted = url.searchParams.get('statuses') || url.searchParams.get('serviceStatuses');
      const matches = !wanted || wanted.includes(cancelled ? 'CANCELLED' : 'RESPONDING');
      const rows = deleted || !matches ? [] : [report()];
      return route.fulfill({ json: { data: { incident: report(), incidents: rows, summary: { total: deleted ? 0 : 1, active: 0, responding: cancelled || deleted ? 0 : 1, resolved: 0, cancelled: cancelled ? 1 : 0 }, pagination: { page: 1, limit: 5, total: rows.length, pages: rows.length ? 1 : 0 } } } });
    }
    return route.fulfill({ json: { data: { alerts: [], units: [] } } });
  });
  return { writes };
}
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test('Main cancellation keeps history without Resolve at ' + viewport.width + 'px', async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const { writes } = await fixture(page);
    await page.goto('/admin/main-dashboard');
    await page.getByRole('button', { name: 'Review / manage report' }).last().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel confirmed false report', exact: true }).click();
    await expect(dialog).toContainText('keeps this report, its evidence and audit history');
    await expect(dialog.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
    await dialog.getByLabel('Reason for cancellation').fill(reason);
    await page.screenshot({ path: info.outputPath('cancel-' + viewport.width + '.png') });
    const width = await dialog.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    await dialog.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes).toEqual([{ path: '/api/incidents/v1/' + id + '/cancel-confirmed-false', method: 'POST',
      body: { reason, reviewFlagId: flagId, expectedReviewUpdatedAt: version, expectedIncidentUpdatedAt: version } }]);
    await expect(dialog).toContainText('CANCELLED');
    await expect(dialog.getByRole('button', { name: 'Close resolved report' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Cancelled / }).click();
    await expect(page.getByText('Synthetic disposition fixture — no emergency').first()).toBeVisible();
  });
  test('Main early deletion is deliberate and version-bound at ' + viewport.width + 'px', async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const { writes } = await fixture(page);
    await page.goto('/admin/main-dashboard');
    await page.getByRole('button', { name: 'Review / manage report' }).last().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete confirmed false report permanently', exact: true }).click();
    await expect(dialog).toContainText('Current status: RESPONDING');
    await dialog.getByLabel('Reason for permanent deletion').fill(reason);
    await dialog.getByLabel('Type DELETE to confirm').fill('delete');
    await expect(dialog.getByRole('button', { name: 'Permanently delete report', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('delete-' + viewport.width + '.png') });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toEqual([]);
    await dialog.getByRole('button', { name: 'Delete confirmed false report permanently', exact: true }).click();
    await dialog.getByLabel('Reason for permanent deletion').fill(reason);
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
    await dialog.getByRole('button', { name: 'Permanently delete report', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([{ path: '/api/incidents/v1/' + id, method: 'DELETE', body: { reason, confirmation: 'DELETE',
      falseReport: { reviewFlagId: flagId, expectedReviewUpdatedAt: version, expectedIncidentUpdatedAt: version } } }]);
  });
}
for (const denied of [403, 409, 503]) for (const action of ['cancel', 'delete']) {
  test(action + ' preserves confirmation inputs after ' + denied, async ({ page }) => {
    const { writes } = await fixture(page, { denied });
    await page.goto('/admin/main-dashboard'); await page.getByRole('button', { name: 'Review / manage report' }).last().click();
    const dialog = page.getByRole('dialog'), cancel = action === 'cancel';
    await dialog.getByRole('button', { name: cancel ? 'Cancel confirmed false report' : 'Delete confirmed false report permanently', exact: true }).click();
    const input = dialog.getByLabel(cancel ? 'Reason for cancellation' : 'Reason for permanent deletion');
    await input.fill(reason); if (!cancel) await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
    await dialog.getByRole('button', { name: cancel ? 'Confirm cancellation' : 'Permanently delete report', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible(); await expect(input).toHaveValue(reason);
    await expect(dialog).toContainText('Current status: RESPONDING'); expect(writes).toHaveLength(1);
  });
}
for (const [department, service, path] of [['FIRE', 'FIRE', 'fire'], ['MEDICAL', 'MEDICAL', 'medical'], ['POLICE', 'POLICE', 'police'], ['DRRMO', 'HAZARD', 'drrmo']]) {
  test(department + ' sees cancellation as retained history without flag, Resolve or dispatch controls', async ({ page }) => {
    const { writes } = await fixture(page, { department, service, cancelled: true });
    await page.goto('/admin/' + path + '-dashboard');
    await page.getByRole('button', { name: /^Cancelled / }).click();
    await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark as Resolved|Dispatch Unit/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'View cancelled report', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('History and evidence remain available');
    await expect(dialog.getByRole('button', { name: /Send review request|Cancel confirmed|Permanently delete/ })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
