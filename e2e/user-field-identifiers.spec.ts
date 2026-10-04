import { expect, test, type Page } from '@playwright/test';

const admin = { id: 'test-main', name: 'Test Main', email: 'main@example.test', role: 'ADMIN', department: 'MAIN', isMainAdmin: true, permissions: ['user:manage'] };
const initialUsers = [
  ...['one', 'two', 'three'].map(id => ({ id: `test-${id}`, name: `Citizen ${id}`, email: `${id}@example.test`, role: 'USER', department: null, isMainAdmin: false })),
  { ...admin },
  { id: 'test-fire', name: 'Fire Admin', email: 'fire@example.test', role: 'ADMIN', department: 'FIRE', isMainAdmin: false },
  { id: 'test-dispatch', name: 'Dispatcher', email: 'dispatch@example.test', role: 'DISPATCHER', department: 'MEDICAL', isMainAdmin: false },
].map(user => ({ ...user, status: 'ACTIVE', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }));

async function mockUsers(page: Page) {
  const users = structuredClone(initialUsers);
  const queries: string[] = [];
  const mutations: Array<{ id: string; payload: Record<string, unknown> }> = [];
  await page.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), admin);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user: admin } } });
    if (path === '/api/events/v1/stream') return route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n' });
    if (path === '/api/users/v1') {
      queries.push(url.search);
      const role = url.searchParams.get('role');
      const search = url.searchParams.get('search')?.toLowerCase();
      const result = users.filter(user => (!role || user.role === role) && (!search || `${user.name} ${user.email}`.toLowerCase().includes(search)));
      return route.fulfill({ json: { data: { users: result } } });
    }
    const roleMatch = path.match(/^\/api\/users\/v1\/([^/]+)\/role$/);
    if (roleMatch && route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON();
      const user = users.find(user => user.id === roleMatch[1])!;
      mutations.push({ id: user.id, payload });
      Object.assign(user, payload);
      return route.fulfill({ json: { data: { user } } });
    }
    return route.fulfill({ json: { data: { incidents: [], summary: { total: 0 }, alerts: [], flags: [] } } });
  });
  return { queries, mutations };
}

async function expectIdentifiedControls(page: Page) {
  const controls = page.locator('main input, main select, main textarea');
  const fields = await controls.evaluateAll(elements => elements.map(element => ({ id: element.id, name: element.getAttribute('name') })));
  expect(fields.length).toBeGreaterThan(0);
  for (const field of fields) {
    expect(field.id).toBeTruthy();
    expect(field.name).toBeTruthy();
  }
  expect(new Set(fields.map(field => field.id)).size).toBe(fields.length);
  expect(new Set(fields.map(field => field.name)).size).toBe(fields.length);
}

for (const width of [1280, 375]) {
  test(`user fields have stable unique identifiers across pages at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 760 });
    await mockUsers(page);
    await page.goto('/admin/users');
    await expect(page.getByRole('combobox', { name: 'Role for Citizen one', exact: true })).toBeVisible();
    await expect(page.locator('main input, main select')).toHaveCount(5);
    await expectIdentifiedControls(page);
    await expect(page.getByRole('textbox', { name: 'Search user accounts' })).toHaveAttribute('id', 'admin-users-search');
    await expect(page.getByRole('combobox', { name: 'Filter users by role' })).toHaveAttribute('id', 'admin-users-role-filter');
    await page.screenshot({ path: testInfo.outputPath('user-fields-citizens.png'), fullPage: true });
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Department for Test Main', exact: true })).toBeVisible();
    await expectIdentifiedControls(page);
    await expect(page.getByRole('checkbox', { name: 'Main admin', exact: true })).toHaveAttribute('id', 'admin-user-main-admin-test-main');
    await page.screenshot({ path: testInfo.outputPath('user-fields-admins.png'), fullPage: true });
    await page.getByRole('button', { name: 'Previous page', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Role for Citizen one', exact: true })).toHaveAttribute('id', 'admin-user-role-test-one');
    await expectIdentifiedControls(page);
  });

  test(`identified user filters and role controls preserve API behavior at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    const mock = await mockUsers(page);
    await page.goto('/admin/users');
    const search = page.getByRole('textbox', { name: 'Search user accounts' });
    const filter = page.getByRole('combobox', { name: 'Filter users by role' });
    await expect(page.getByRole('combobox', { name: 'Role for Citizen one', exact: true })).toBeVisible();
    await search.fill('Citizen two');
    await expect(page.getByRole('combobox', { name: 'Role for Citizen two', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Role for Citizen one', exact: true })).toHaveCount(0);
    expect(mock.queries.some(query => new URLSearchParams(query).get('search') === 'Citizen two')).toBe(true);
    await search.fill('');
    await filter.selectOption('ADMIN');
    await expect(page.getByRole('combobox', { name: 'Role for Test Main', exact: true })).toBeVisible();
    expect(mock.queries.some(query => new URLSearchParams(query).get('role') === 'ADMIN')).toBe(true);
    await expectIdentifiedControls(page);
    await page.getByRole('combobox', { name: 'Department for Fire Admin', exact: true }).selectOption('MEDICAL');
    await expect.poll(() => mock.mutations[0]).toEqual({ id: 'test-fire', payload: { role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false } });
    await expect(page.getByRole('combobox', { name: 'Department for Fire Admin', exact: true })).toBeEnabled();
    // This controlled checkbox waits for the API and list refresh, rather than
    // optimistically changing its checked value during the click itself.
    await page.getByRole('checkbox', { name: 'Main admin', exact: true }).click();
    await expect.poll(() => mock.mutations[1]).toEqual({ id: 'test-main', payload: { role: 'ADMIN', department: 'MAIN', isMainAdmin: false } });
    await expect(page.getByRole('checkbox', { name: 'Main admin', exact: true })).toBeEnabled();
    await expect(page.getByRole('checkbox', { name: 'Main admin', exact: true })).not.toBeChecked();
    await filter.selectOption('USER');
    const role = page.getByRole('combobox', { name: 'Role for Citizen one', exact: true });
    await expect(role).toBeVisible();
    await role.selectOption('RESPONDER');
    await expect.poll(() => mock.mutations[2]).toEqual({ id: 'test-one', payload: { role: 'RESPONDER', department: null, isMainAdmin: false } });
    await expect(page.getByRole('combobox', { name: 'Role for Citizen one', exact: true })).toHaveCount(0);
    await expectIdentifiedControls(page);
  });
}
