import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, department = 'MAIN', filtered = false) {
  const main = department === 'MAIN';
  const scope = main ? filtered ? 'FIRE' : 'MAIN' : department === 'DRRMO' ? 'HAZARD' : department;
  const user = { id: `synthetic-${department}`, role: 'ADMIN', status: 'ACTIVE', department, isMainAdmin: main };
  const item = { incidentId: '10000000-0000-4000-8000-000000000001', title: 'Synthetic handoff test', version: 1, scope,
    reportedAt: '2026-10-08T00:00:00Z', status: 'RESPONDING', type: { typeName: 'Fire' } };
  const report = { ...item, description: 'Synthetic report only', verificationStatus: 'VERIFIED', reportedBy: 'citizen',
    requestedServices: [scope === 'MAIN' ? 'FIRE' : scope], serviceResponses: [{ service: scope === 'MAIN' ? 'FIRE' : scope, status: 'RESPONDING' }],
    attachments: [], reporter: { name: 'Synthetic citizen' }, location: { locationName: 'Synthetic location' } };
  let items = [item], fail = false;
  const writes: { path: string; body: unknown }[] = [];
  await page.addInitScript(value => {
    localStorage.setItem('user', JSON.stringify(value));
    class QuietStream { addEventListener() {} close() {} }
    Object.assign(window, { EventSource: QuietStream });
  }, user);
  await page.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') {
      writes.push({ path, body: req.postDataJSON() });
      if (main || !path.endsWith('/attention/acknowledge')) return route.fulfill({ status: 403, json: { message: 'Forbidden' } });
      items = []; return route.fulfill({ json: { message: 'Acknowledged' } });
    }
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/attention')) return route.fulfill({ status: fail ? 503 : 200, json: fail ? { message: 'Unavailable' } : {
      data: { items, hasMore: false, scope, acknowledgementMode: main ? 'DEPARTMENT_HANDOFF' : 'PERSONAL' },
    } });
    return route.fulfill({ json: { data: { incidents: [report], flags: [], alerts: [], units: [], users: [],
      pagination: { page: 1, pages: 1, total: 1, limit: 5 }, summary: { total: 1, active: 0, responding: 1, resolved: 0 },
      serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 }, verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 } } } });
  });
  await page.goto(`/admin/${main ? filtered ? 'fire' : 'main' : department === 'DRRMO' ? 'drrmo' : department.toLowerCase()}-dashboard`);
  await expect(page.getByRole('dialog')).toContainText(item.title);
  return { writes, fail: (value: boolean) => { fail = value; }, handoff: () => { items = []; }, reopen: () => { items = [{ ...item, version: 2 }]; },
    add: () => { items = [...items, { ...item, incidentId: '10000000-0000-4000-8000-000000000002', title: 'Second synthetic handoff test' }]; },
    handoffFirst: () => { items = items.slice(1); } };
}
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

for (const width of [390, 1440]) {
  test(`Main Admin waits for department handoff and retains alerts during outages (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await setup(page);
    await expect(page.getByRole('button', { name: 'Acknowledge this report', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toContainText('Only an assigned Fire, Medical, Police or DRRMO Admin');
    await expect(page.getByRole('button', { name: 'Review later — keep in queue', exact: true })).toHaveCount(0);
    await page.mouse.click(3, 3);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toContainText('Synthetic handoff test');
    await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unmute alert', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await refresh(page);
    await expect(page.getByRole('dialog')).toContainText('Alert sound is muted');
    await page.screenshot({ path: testInfo.outputPath(`main-handoff-${width}.png`) });
    await page.getByRole('button', { name: 'Unmute alert', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mute alert', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
    state.fail(true); await refresh(page);
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('may be out of date');
    await expect(page.getByRole('button', { name: 'Unmute alert', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toContainText('Synthetic handoff test');
    state.fail(false); state.handoff(); await refresh(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
    state.reopen(); await refresh(page);
    await expect(page.getByRole('dialog')).toContainText('Synthetic handoff test');
    await expect(page.getByRole('button', { name: 'Mute alert', exact: true })).toBeVisible();
    expect(state.writes).toEqual([]);
  });
}
test('Main Admin cannot self-acknowledge from a Fire-filtered dashboard either', async ({ page }) => {
  const state = await setup(page, 'MAIN', true);
  await expect(page.getByRole('button', { name: 'Acknowledge this report', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Only an assigned Fire');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  state.handoff(); await page.getByRole('button', { name: 'Check department acknowledgement', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark as Resolved', exact: true })).toHaveCount(0);
  await expect(page.getByText('Resolution is handled by the assigned department.', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});
test('Main keeps the remaining report open after one handoff and new reports are not muted by an earlier mute', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
  state.add(); await refresh(page);
  await expect(page.getByLabel('Choose a report to review').locator('option')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Mute alert', exact: true })).toBeVisible();
  state.handoffFirst(); await refresh(page);
  await expect(page.getByRole('dialog')).toContainText('Second synthetic handoff test');
  await expect(page.getByRole('dialog')).not.toContainText('Synthetic handoff test');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  state.handoff(); await refresh(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`${department} Admin can acknowledge without requesting incident resolution`, async ({ page }) => {
    const state = await setup(page, department);
    await page.getByRole('button', { name: 'Acknowledge this report', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.writes).toEqual([{ path: '/api/incidents/v1/10000000-0000-4000-8000-000000000001/attention/acknowledge',
      body: { version: 1, responseService: department === 'DRRMO' ? 'HAZARD' : department } }]);
  });
}
