import { expect, test } from '@playwright/test';

const incidentId = '10000000-0000-4000-8000-000000000001';
const flagId = '20000000-0000-4000-8000-000000000002';
const baseIncident = {
  incidentId, title: 'Clearly labeled review test', description: 'Synthetic test report for review controls',
  status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: ['FIRE'],
  reportedBy: 'citizen', reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  type: { typeName: 'Fire' }, location: { locationName: 'Gabi' }, reporter: { name: 'Synthetic Citizen' },
  attachments: [], incidentUnits: [], serviceResponses: [{ service: 'FIRE', status: 'RESPONDING' }], reviewFlags: [] as Record<string, unknown>[],
};

for (const [department, service, path] of [
  ['FIRE', 'FIRE', 'fire'], ['MEDICAL', 'MEDICAL', 'medical'], ['POLICE', 'POLICE', 'police'], ['DRRMO', 'HAZARD', 'drrmo'],
]) {
  test(`${department} admin can request review without deleting or hiding the incident`, async ({ page }) => {
    const user = { id: 'department-admin', role: 'ADMIN', department, isMainAdmin: false };
    await page.addInitScript(value => localStorage.setItem('user', JSON.stringify(value)), user);
    await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user } } }));
    let report = { ...baseIncident, requestedServices: [service], serviceResponses: [{ service, status: 'RESPONDING' }] };
    let flagRequests = 0;
    let deletionRequests = 0;
    await page.route('**/api/incidents/v1/**', route => {
      if (route.request().method() === 'DELETE') deletionRequests++;
      if (route.request().method() === 'POST') {
        flagRequests++;
        expect(route.request().postDataJSON()).toEqual({ reason: 'The caller says this was a training test.' });
        const flag = { reviewFlagId: flagId, incidentId, department, status: 'PENDING', reason: 'The caller says this was a training test.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        report = { ...report, reviewFlags: [flag] };
        return route.fulfill({ json: { data: { flag } } });
      }
      return route.fulfill({ json: { data: { incidents: [report], incident: report } } });
    });
    await page.route('**/api/events/v1/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n' }));
    await page.route('**/api/alerts/v1/**', route => route.fulfill({ json: { data: { alerts: [] } } }));
    await page.goto(`/admin/${path}-dashboard`);
    await page.getByRole('button', { name: 'Flag suspected false report' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('response work continues');
    await expect(dialog.getByRole('button', { name: 'Send review request' })).toBeDisabled();
    await dialog.getByLabel('Why do you suspect this report is false?').fill('The caller says this was a training test.');
    await dialog.getByRole('button', { name: 'Send review request' }).click();
    await expect(dialog.getByRole('status')).toContainText('Review request saved');
    await expect(dialog).toContainText('Current status: RESPONDING');
    await expect(dialog.getByRole('button', { name: /delete/i })).toHaveCount(0);
    expect(flagRequests).toBe(1);
    expect(deletionRequests).toBe(0);
  });
}

test('main admin reviews, closes and deliberately deletes a report with a reason', async ({ page }) => {
  const user = { id: 'main-admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true };
  await page.addInitScript(value => localStorage.setItem('user', JSON.stringify(value)), user);
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user } } }));
  let flag = { reviewFlagId: flagId, incidentId, department: 'FIRE', status: 'PENDING', reason: 'The caller says this was a training test.', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', reviewNotes: '' };
  let report = { ...baseIncident, reviewFlags: [flag] };
  let removed = false;
  const deletes: unknown[] = [];
  await page.route('**/api/incidents/v1/**', route => {
    const req = route.request();
    if (req.url().includes('/review-flags') && req.method() === 'GET') return route.fulfill({ json: { data: { flags: removed ? [] : [{ ...flag, incident: report }], pagination: { page: 1, limit: 20, total: removed ? 0 : 1, pages: removed ? 0 : 1 } } } });
    if (req.method() === 'PATCH') {
      expect(req.postDataJSON()).toEqual({ status: 'CONFIRMED', reviewNotes: 'Confirmed by contacting the test operator.', expectedUpdatedAt: flag.updatedAt });
      flag = { ...flag, status: 'CONFIRMED', reviewNotes: 'Confirmed by contacting the test operator.' };
      report = { ...report, reviewFlags: [flag] };
      return route.fulfill({ json: { data: { flag } } });
    }
    if (req.method() === 'PUT') {
      expect(['RESOLVED', 'CLOSED']).toContain(req.postDataJSON().status);
      report = { ...report, status: req.postDataJSON().status };
      return route.fulfill({ json: { data: { incident: report } } });
    }
    if (req.method() === 'DELETE') {
      deletes.push(req.postDataJSON()); removed = true;
      return route.fulfill({ json: { code: 200, message: 'Incident deleted successfully' } });
    }
    return route.fulfill({ json: { data: { incidents: removed ? [] : [report], incident: report } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n' }));
  await page.route('**/api/alerts/v1/**', route => route.fulfill({ json: { data: { alerts: [] } } }));
  await page.goto('/admin/main-dashboard');
  await expect(page.getByRole('heading', { name: 'Report review queue' })).toBeVisible();
  await page.getByRole('button', { name: 'Review / manage report' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Confirm false report' })).toBeDisabled();
  await dialog.getByLabel('Review explanation (required)').fill('Confirmed by contacting the test operator.');
  await dialog.getByRole('button', { name: 'Confirm false report' }).click();
  await expect(dialog).toContainText('Confirmed false report');
  await expect(dialog.getByRole('button', { name: 'Delete closed report permanently' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Resolve confirmed false report' }).click();
  await expect(dialog).toContainText('Current status: RESOLVED');
  await dialog.getByRole('button', { name: 'Close resolved report' }).click();
  await expect(dialog).toContainText('Current status: CLOSED');
  await dialog.getByRole('button', { name: 'Delete closed report permanently' }).click();
  await expect(dialog.getByRole('button', { name: 'Permanently delete report' })).toBeDisabled();
  await dialog.getByLabel('Reason for permanent deletion').fill('Confirmed false report after reviewing the caller details.');
  await dialog.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(dialog.getByRole('button', { name: 'Permanently delete report' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(deletes).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Delete closed report permanently' }).click();
  await dialog.getByLabel('Reason for permanent deletion').fill('Confirmed false report after reviewing the caller details.');
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await dialog.getByRole('button', { name: 'Permanently delete report' }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toEqual([{ reason: 'Confirmed false report after reviewing the caller details.', confirmation: 'DELETE' }]);
  await expect(page.getByText('No pending or confirmed review flags.')).toBeVisible();
});
