import { expect, test, type Page } from '@playwright/test';

const incidentId = '10000000-0000-4000-8000-000000000001';
const flagId = '20000000-0000-4000-8000-000000000002';
const version = '2026-10-12T00:00:00.000Z';
const explanation = 'An on-site check confirmed that this was a genuine emergency.';

async function fixture(page: Page, denied?: number) {
  const user = { id: 'synthetic-main', role: 'ADMIN', department: 'MAIN', isMainAdmin: true };
  await page.addInitScript(value => localStorage.setItem('user', JSON.stringify(value)), user);
  let confirmed = true;
  const corrections: unknown[] = [];
  const operationalWrites: string[] = [];
  const report = () => ({
    incidentId, title: 'Synthetic review correction — no emergency', description: 'Synthetic fixture only.',
    status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: ['FIRE'],
    reportedAt: version, updatedAt: version, reportedBy: 'synthetic-citizen',
    type: { typeName: 'Fire' }, location: { locationName: 'Synthetic location' }, reporter: { name: 'Synthetic Citizen' },
    attachments: [], incidentUnits: [], serviceResponses: [{ service: 'FIRE', status: 'RESPONDING' }],
    reviewFlags: confirmed ? [{ reviewFlagId: flagId, incidentId, department: 'FIRE', status: 'CONFIRMED', reason: 'The initial information suggested a training report.', reviewNotes: 'The original mistaken confirmation.', createdAt: version, updatedAt: version }] : [],
  });
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/events/v1/stream')) return route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n' });
    if (path.endsWith('/correction')) {
      corrections.push(request.postDataJSON());
      if (denied) return route.fulfill({ status: denied, json: { message: denied === 409 ? 'This flag was changed or reviewed. Refresh before deciding.' : 'Your session or administrator permissions changed. Refresh or log in again.' } });
      confirmed = false;
      return route.fulfill({ json: { data: { flag: { status: 'DISMISSED' } } } });
    }
    if (request.method() !== 'GET') operationalWrites.push(`${request.method()} ${path}`);
    if (path.includes('/incidents/v1/')) {
      if (path.endsWith('/review-flags')) return route.fulfill({ json: { data: { flags: report().reviewFlags.map(flag => ({ ...flag, incident: report() })), pagination: { page: 1, limit: 20, total: confirmed ? 1 : 0, pages: confirmed ? 1 : 0 } } } });
      return route.fulfill({ json: { data: { incidents: [report()], incident: report() } } });
    }
    return route.fulfill({ json: { data: { alerts: [], items: [] } } });
  });
  await page.goto('/admin/main-dashboard');
  await page.locator('section[aria-labelledby="report-review-queue"]').getByRole('button', { name: 'Review / manage report' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Correct mistaken confirmation' })).toBeVisible();
  return { dialog, corrections, operationalWrites };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`Main Admin can cancel then correct a mistaken confirmation at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { dialog, corrections, operationalWrites } = await fixture(page);
    await dialog.getByRole('button', { name: 'Correct mistaken confirmation' }).click();
    const submit = dialog.getByRole('button', { name: 'Save correction and dismiss flag' });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Why was the false-report decision incorrect?').fill(explanation);
    await dialog.getByRole('button', { name: 'Cancel correction' }).click();
    expect(corrections).toEqual([]);
    await dialog.getByRole('button', { name: 'Correct mistaken confirmation' }).click();
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Why was the false-report decision incorrect?').fill(explanation);
    await expect(dialog).toContainText('original decision and your correction remain in the audit log');
    await page.screenshot({ path: test.info().outputPath(`correction-form-${viewport.width}.png`), fullPage: true });
    await submit.click();
    // A queue-owned dialog unmounts when its corrected flag leaves the queue.
    // Verify the retained report after that refresh, not an ephemeral notice.
    await expect(page.getByText('No pending or confirmed review flags.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Review / manage report' }).first().click();
    await expect(dialog).toContainText('Current status: RESPONDING');
    await expect(dialog.getByRole('button', { name: 'Correct mistaken confirmation' })).toHaveCount(0);
    expect(corrections).toEqual([{ reviewNotes: explanation, expectedUpdatedAt: version }]);
    expect(operationalWrites).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`correction-${viewport.width}.png`), fullPage: true });
  });
}

for (const denied of [403, 409]) {
  test(`a ${denied} correction error preserves the decision and entered explanation`, async ({ page }) => {
    const { dialog, corrections, operationalWrites } = await fixture(page, denied);
    await dialog.getByRole('button', { name: 'Correct mistaken confirmation' }).click();
    await dialog.getByLabel('Why was the false-report decision incorrect?').fill(explanation);
    await dialog.getByRole('button', { name: 'Save correction and dismiss flag' }).click();
    await expect(dialog.getByRole('alert')).toContainText(denied === 403 ? 'permissions changed' : 'Refresh before deciding');
    await expect(dialog.getByLabel('Why was the false-report decision incorrect?')).toHaveValue(explanation);
    await expect(dialog).toContainText('The original mistaken confirmation.');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    expect(corrections).toHaveLength(1);
    expect(operationalWrites).toEqual([]);
  });
}
