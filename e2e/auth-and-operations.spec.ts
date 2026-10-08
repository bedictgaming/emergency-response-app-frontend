import { expect, test } from '@playwright/test';

test('login and signup use an equal-width segmented control', async ({ page }) => {
  await page.goto('/login');
  const loginTab = page.getByRole('tab', { name: 'Log In', exact: true });
  const signupTab = page.getByRole('tab', { name: 'Sign In', exact: true });
  const [loginBox, signupBox] = await Promise.all([loginTab.boundingBox(), signupTab.boundingBox()]);

  expect(loginBox).not.toBeNull();
  expect(signupBox).not.toBeNull();
  expect(Math.abs(loginBox!.width - signupBox!.width)).toBeLessThanOrEqual(1);
  await signupTab.click();
  await expect(signupTab).toHaveAttribute('aria-selected', 'true');
  // The operator deliberately renamed this tab; it still creates an account.
  await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
  await loginTab.click();
  await expect(loginTab).toHaveAttribute('aria-selected', 'true');
});

test('traditional login has blank credentials, optional Google and recovery but no resend', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend verification|Send reset link|Set new password/i })).toHaveCount(0);
});

for (const path of ['/', '/login']) {
  test(`reset links require explicit submission on ${path}`, async ({ page }) => {
    let requests = 0;
    await page.route('**/api/auth/v1/password-reset/**', route => { requests++; return route.abort(); });
    await page.goto(`${path}?resetToken=${'b'.repeat(64)}`);
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set new password' })).toBeVisible();
    expect(requests).toBe(0);
    await expect(page).toHaveURL(`/login?resetToken=${'b'.repeat(64)}`);
  });
}

test('admin can reach the operations management surface', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', name: 'Test Admin', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: { id: 'admin', role: 'ADMIN', name: 'Test Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true, permissions: ['user:manage'] } } } }));
  await page.route('**/api/incidents/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { incidents: [] } }) }));
  await page.route('**/api/units/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { units: [] } }) }));
  await page.route('**/api/users/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { users: [] } }) }));
  await page.route('**/api/resources/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { resources: [] } }) }));
  await page.route('**/api/responders/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { responders: [] } }) }));
  await page.route('**/api/tasks/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { tasks: [] } }) }));
  await page.goto('/admin/operations');
  await expect(page.getByRole('heading', { name: 'Operations management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Responders' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Incident tasks' })).toBeVisible();
});

test('main admin has no verification queue and receives new incidents as responding', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', name: 'Test Admin', department: 'MAIN', isMainAdmin: true }));
  });
  let incident = {
    incidentId: 'incident-1',
    title: 'Fire emergency',
    description: 'Visible smoke',
    status: 'RESPONDING',
    verificationStatus: 'VERIFIED',
    reportedBy: 'citizen',
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'type-1', typeName: 'Fire' },
    location: { locationId: 'location-1', locationName: 'Poblacion' },
    reporter: { id: 'citizen', name: 'Citizen' },
    attachments: [],
    serviceResponses: [{ service: 'FIRE', status: 'RESPONDING' }],
  };
  let resolutionRequests = 0;
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'admin', role: 'ADMIN', name: 'Test Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true } } },
  }));
  await page.route('**/api/incidents/v1/**', route => {
    if (route.request().method() === 'PUT') {
      resolutionRequests += 1;
      expect(route.request().postDataJSON()).toEqual({ status: 'RESOLVED' });
      incident = {
        ...incident,
        status: 'RESOLVED',
        serviceResponses: [{ service: 'FIRE', status: 'RESOLVED' }],
      };
      return route.fulfill({ json: { data: { incident } } });
    }
    return route.fulfill({ json: { data: { incidents: [incident] } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/admin/main-dashboard');

  await expect(page.getByRole('button', { name: /Pending/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Responding (1)' })).toBeVisible();
  await expect(page.getByText('RESPONDING', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Verify|Reject/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Resolve Incident|Main Admin Override/ })).toHaveCount(0);
  await expect(page.getByText('Resolution is handled by the assigned departments.')).toBeVisible();
  expect(resolutionRequests).toBe(0);
});

test('main admin paginates 14 All and Resolved reports across three pages', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true } } },
  }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  const requestedUrls: URL[] = [];
  const incident = (number: number, status = 'RESOLVED') => ({
    incidentId: `incident-${number}`,
    title: `Emergency report ${number}`,
    description: `Report ${number}`,
    status,
    verificationStatus: 'VERIFIED',
    reportedBy: 'citizen',
    reportedAt: new Date(Date.now() - number * 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'fire', typeName: 'Fire' },
    location: { locationId: 'loc', locationName: 'Poblacion' },
    reporter: { id: 'citizen', name: 'Citizen' },
    attachments: [],
    serviceResponses: [{ service: 'FIRE', status: 'RESOLVED' }],
  });

  await page.route('**/api/incidents/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/review-flags')) return route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
    requestedUrls.push(url);
    const currentPage = Number(url.searchParams.get('page') ?? '1');
    const firstReport = (currentPage - 1) * 5 + 1;
    const reportCount = currentPage === 3 ? 4 : 5;
    return route.fulfill({ json: { data: {
      incidents: Array.from({ length: reportCount }, (_, index) => incident(firstReport + index)),
      pagination: { page: currentPage, limit: 5, total: 14, pages: 3 },
      summary: {
        total: 14,
        active: 0,
        responding: 0,
        resolved: 14,
        services: { fire: 14, medical: 0, police: 0, hazard: 0 },
      },
      verifiedSummary: { total: 14, active: 0, responding: 0, resolved: 14,
        services: { fire: 14, medical: 0, police: 0, hazard: 0 } },
    } } });
  });

  await page.goto('/admin/main-dashboard');
  await expect(page.getByRole('button', { name: 'All (14)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resolved (14)' })).toBeVisible();
  await expect(page.getByText('Fire Emergencies', { exact: true }).locator('..').getByText('14', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to page 3' })).toHaveCount(1);
  await expect(page.locator('h3').filter({ hasText: /^Emergency report \d+$/ })).toHaveCount(5);
  await page.getByRole('button', { name: 'Go to page 3' }).click();
  await expect(page.locator('h3').filter({ hasText: /^Emergency report \d+$/ })).toHaveCount(4);
  await expect(page.getByText('Emergency report 14')).toBeVisible();
  await expect(page.getByText('Showing 11-14 of 14 reports').first()).toBeVisible();
  await expect(page.getByText('Fire Emergencies', { exact: true }).locator('..').getByText('14', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Resolved (14)' }).click();
  await expect(page.locator('h3').filter({ hasText: /^Emergency report \d+$/ })).toHaveCount(5);
  await expect(page.getByText('Showing 1-5 of 14 reports').first()).toBeVisible();
  expect(requestedUrls.some(url =>
    url.searchParams.get('limit') === '5'
    && url.searchParams.get('includeAttachments') === 'true'
    && url.searchParams.get('includeVerifiedSummary') === 'true'
  )).toBe(true);
  expect(requestedUrls.some(url =>
    url.searchParams.get('limit') === '5'
    && url.searchParams.get('statuses') === 'RESOLVED,CLOSED'
  )).toBe(true);
});

for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO'] as const) {
  for (const width of [1280, 375]) {
  test(`${department} admin paginates five reports at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.addInitScript((currentDepartment) => {
      localStorage.setItem('user', JSON.stringify({
        id: 'department-admin', role: 'ADMIN', department: currentDepartment, isMainAdmin: false,
      }));
    }, department);
    await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: {
      id: 'department-admin', role: 'ADMIN', department, isMainAdmin: false,
    } } } }));
    await page.route('**/api/events/v1/stream', route => route.fulfill({
      status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
    }));
    const service = department === 'DRRMO' ? 'HAZARD' : department;
    const typeName = department === 'DRRMO' ? 'Hazard' : department[0] + department.slice(1).toLowerCase();
    const requestedUrls: URL[] = [];
    const incidents = Array.from({ length: 7 }, (_, index) => {
      const status = index === 6 ? 'RESOLVED' : 'RESPONDING';
      return {
        incidentId: `incident-${index}`, title: `${typeName} report ${index + 1}`,
        description: 'Synthetic pagination test report', status, verificationStatus: 'VERIFIED',
        reportedBy: 'citizen', reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        type: { typeId: 'type', typeName }, location: { locationId: 'loc', locationName: 'Poblacion' },
        reporter: { id: 'citizen', name: 'Test citizen' }, attachments: [], incidentUnits: [],
        serviceResponses: [{ service, status }],
      };
    });
    await page.route('**/api/incidents/v1/**', route => {
      const url = new URL(route.request().url());
      requestedUrls.push(url);
      const currentPage = Number(url.searchParams.get('page') ?? '1');
      const limit = Number(url.searchParams.get('limit') ?? '5');
      const statuses = url.searchParams.get('serviceStatuses')?.split(',');
      const filtered = incidents.filter(incident => !statuses || statuses.includes(incident.status));
      return route.fulfill({ json: { data: {
        incidents: filtered.slice((currentPage - 1) * limit, currentPage * limit),
        pagination: { page: currentPage, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
        summary: { total: 7, active: 0, responding: 6, resolved: 1, services: {
          fire: department === 'FIRE' ? 7 : 0,
          medical: department === 'MEDICAL' ? 7 : 0,
          police: department === 'POLICE' ? 7 : 0,
          hazard: department === 'DRRMO' ? 7 : 0,
        } },
      } } });
    });

    await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
    const cards = page.locator('h3').filter({ hasText: new RegExp(`^${typeName} report \\d+$`) });
    const pager = page.locator('[aria-label="Incident reports pagination"]');
    const navigation = page.getByRole('navigation', { name: 'Report pages' });
    await expect(cards).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Responding (6)', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolved (1)', exact: true })).toBeVisible();
    await expect(pager).toHaveCount(1);
    await expect(pager).toContainText('Showing 1-5 of 6 reports');
    await expect(navigation.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
    await navigation.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText(`${typeName} report 6`)).toBeVisible();
    await expect(pager).toContainText('Showing 6-6 of 6 reports');
    await expect(page.getByRole('button', { name: 'Responding (6)', exact: true })).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    if (department === 'FIRE') {
      await pager.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`department-pagination-${width}.png`) });
    }
    await navigation.getByRole('button', { name: 'Previous page', exact: true }).click();
    await expect(cards).toHaveCount(5);
    await expect(page.getByText(`${typeName} report 1`, { exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(pager).toContainText('Showing 6-6 of 6 reports');
    await page.getByRole('button', { name: 'Resolved (1)', exact: true }).click();
    await expect(page.getByText(`${typeName} report 7`, { exact: true })).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(pager).toHaveCount(0);
    await page.getByRole('button', { name: 'Responding (6)', exact: true }).click();
    await expect(cards).toHaveCount(5);
    await expect(pager).toContainText('Showing 1-5 of 6 reports');
    const listRequests = requestedUrls.filter(url => url.searchParams.has('page'));
    expect(listRequests.length).toBeGreaterThan(0);
    for (const url of listRequests) {
      expect(url.searchParams.get('limit')).toBe('5');
      expect(url.searchParams.get('department')).toBe(department);
      expect(url.searchParams.get('responseService')).toBe(service);
    }
    expect(listRequests.some(url => url.searchParams.get('page') === '2')).toBe(true);
    expect(listRequests.some(url => url.searchParams.get('page') === '1'
      && url.searchParams.get('serviceStatuses') === 'RESOLVED')).toBe(true);
  });
  }
}

test('main verified totals match history without hiding rejected review records', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: {
    id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true,
  } } } }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
  await page.route('**/api/incidents/v1/**', route => new URL(route.request().url()).pathname.endsWith('/review-flags')
    ? route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } })
    : route.fulfill({ json: { data: {
    incidents: [{
      incidentId: 'rejected-record', title: 'Rejected report retained for review', description: 'Synthetic review record',
      status: 'CLOSED', verificationStatus: 'REJECTED', reportedBy: 'citizen',
      reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      type: { typeId: 'medical', typeName: 'Medical' },
      location: { locationId: 'loc', locationName: 'Test barangay' },
      reporter: { id: 'citizen', name: 'Test citizen' }, attachments: [], serviceResponses: [],
    }], pagination: { page: 1, limit: 5, total: 15, pages: 3 },
    summary: { total: 15, active: 0, responding: 0, resolved: 15,
      services: { fire: 6, medical: 4, police: 2, hazard: 3 } },
    verifiedSummary: { total: 14, active: 0, responding: 0, resolved: 14,
      services: { fire: 6, medical: 3, police: 2, hazard: 3 } },
  } } }));
  await page.route('**/api/analytics/v1/dashboard', route => route.fulfill({ json: { data: {
    incidentsByBarangay: { rankings: [], totalIncidents: 14, topArea: null },
    incidentsByType: { distribution: [], totalIncidents: 14, topType: null },
    resolvedSummary: { resolvedThisMonth: 14, totalReportedThisMonth: 14,
      resolutionRate: 100, totalResolvedAllTime: 14, totalHistorical: 14,
      month: 9, year: 2026 },
  } } }));

  await page.goto('/admin/main-dashboard');
  const cards = page.locator('[aria-label="Verified report summary"]');
  await expect(cards.getByText('14', { exact: true })).toHaveCount(2);
  await expect(cards.getByText('15', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Verified resolved / closed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All (15)', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rejected report retained for review', exact: true })).toBeVisible();
  await expect(page.getByText('Rejected report.', { exact: true })).toBeVisible();
  await expect(page.getByText('Excluded from verified analytics; retained in all report records.', { exact: false })).toBeVisible();
  await expect(page.getByText('Includes unverified and rejected records for review.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Resolved (15)', exact: true }).click();
  await expect(cards.getByText('14', { exact: true })).toHaveCount(2);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(cards.getByText('Verified resolved / closed', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`verified-summary-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole('button', { name: 'Barangay History Log' }).click();
  await expect(page.getByText('Verified Reports Resolved')).toBeVisible();
  await expect(page.getByText('September 2026 · 14 of 14 verified reports (100%).')).toBeVisible();
});

test('main report cards explain verification independently of response status', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: {
    id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true,
  } } } }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
  const mutations: string[] = [];
  await page.route('**/api/incidents/v1/**', route => {
    if (route.request().method() !== 'GET') mutations.push(route.request().method());
    if (new URL(route.request().url()).pathname.endsWith('/review-flags')) {
      return route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
    }
    return route.fulfill({ json: { data: {
      incidents: ['VERIFIED', 'PENDING', 'REJECTED', undefined].map((verificationStatus, index) => ({
        incidentId: `state-${index}`, title: `Synthetic verification record ${index}`, status: 'RESOLVED',
        verificationStatus, reportedAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z',
        type: { typeId: 'fire', typeName: 'Fire Outbreak' }, attachments: [], serviceResponses: [],
      })),
      pagination: { page: 1, limit: 5, total: 4, pages: 1 },
      summary: { total: 4, active: 0, responding: 0, resolved: 4 },
      verifiedSummary: { total: 1, active: 0, responding: 0, resolved: 1 },
    } } });
  });
  await page.goto('/admin/main-dashboard');
  for (const text of ['Verified report.', 'Pending verification.', 'Rejected report.', 'Verification unavailable.']) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Included in verified analytics.', { exact: false })).toHaveCount(1);
  await expect(page.getByText('Excluded from verified analytics; retained in all report records.', { exact: false })).toHaveCount(2);
  await expect(page.getByText('Analytics inclusion could not be determined.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All (4)', exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="Verified report summary"]').getByText('1', { exact: true })).toHaveCount(2);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`verification-labels-${width}.png`), fullPage: true });
  }
  expect(mutations).toEqual([]);
});

test('missing verified aggregates never display all-record totals as verified', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: {
    id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true,
  } } } }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
  await page.route('**/api/incidents/v1/**', route => new URL(route.request().url()).pathname.endsWith('/review-flags')
    ? route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } })
    : route.fulfill({ json: { data: {
      incidents: [], pagination: { page: 1, limit: 5, total: 15, pages: 3 },
      summary: { total: 15, active: 0, responding: 0, resolved: 15 },
    } } }));
  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Verified totals could not be loaded. Use Refresh to try again.')).toBeVisible();
  const cards = page.locator('[aria-label="Verified report summary"]');
  await expect(cards.getByText('15', { exact: true })).toHaveCount(0);
  await expect(cards.getByText('—', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'All (15)', exact: true })).toBeVisible();
});

test('analytics labels distinguish verified lifetime totals from Manila monthly totals', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: {
    id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true,
  } } } }));
  await page.route('**/api/analytics/v1/dashboard', route => route.fulfill({ json: { data: {
    incidentsByBarangay: { rankings: [], totalIncidents: 13, topArea: null },
    incidentsByType: { distribution: [], totalIncidents: 13, topType: null },
    resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 3, resolvedThisMonth: 3,
      activeThisMonth: 0, resolutionRate: 100, totalHistorical: 13, totalResolvedAllTime: 13 },
  } } }));
  await page.goto('/admin/analytics');
  await expect(page.getByText('Total verified reports', { exact: true }).locator('..').getByText('13', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified resolved / closed · all time', { exact: true }).locator('..').getByText('13', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified reports resolved · submitted this month', { exact: true }).locator('..').getByText('3', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified reports only.', { exact: false })).toBeVisible();
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`analytics-period-labels-${width}.png`), fullPage: true });
  }
});

test('admin refreshes after a report arrives during an in-flight list request', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
    const sources = new Set<TestEventSource>();
    class TestEventSource {
      private listeners = new Map<string, EventListenerOrEventListenerObject>();
      emit = () => {
        const listener = this.listeners.get('incident.created');
        const event = new Event('incident.created');
        if (typeof listener === 'function') listener(event);
        else listener?.handleEvent(event);
        return Boolean(listener);
      };
      constructor() {
        sources.add(this);
        (window as Window & { emitTestIncident?: () => boolean }).emitTestIncident = () => {
          let delivered = false;
          for (const source of sources) delivered = source.emit() || delivered;
          return delivered;
        };
      }
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.set(type, listener); }
      close() { sources.delete(this); }
    }
    Object.defineProperty(window, 'EventSource', { value: TestEventSource });
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true } } },
  }));
  let reportVisible = false;
  let incidentRequests = 0;
  await page.route('**/api/incidents/v1/**', async route => {
    incidentRequests += 1;
    if (!reportVisible) {
      await new Promise(resolve => setTimeout(resolve, 1_500));
      return route.fulfill({ json: { data: { incidents: [] } } });
    }
    return route.fulfill({ json: { data: { incidents: [{
      incidentId: 'new-report', title: 'New citizen emergency', description: 'Just submitted',
      status: 'RESPONDING', verificationStatus: 'VERIFIED', reportedBy: 'citizen',
      reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      type: { typeId: 'fire', typeName: 'Fire' }, location: { locationId: 'loc', locationName: 'Poblacion' },
      reporter: { id: 'citizen', name: 'Citizen' }, attachments: [], serviceResponses: [],
    }] } } });
  });

  await page.goto('/admin/main-dashboard');
  await expect.poll(() => incidentRequests).toBeGreaterThan(0);
  const initialRequests = incidentRequests;
  const eventDelivered = await page.evaluate(() => {
    const emit = (window as Window & { emitTestIncident?: () => boolean }).emitTestIncident;
    return emit?.() ?? false;
  });
  expect(eventDelivered).toBe(true);
  reportVisible = true;
  await expect.poll(() => incidentRequests).toBeGreaterThan(initialRequests);
  await expect(page.getByText('New citizen emergency')).toBeVisible();
});

test('returning to an authorized admin tab revalidates without hiding the dashboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', name: 'Test Admin', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/**', route => route.fulfill({ json: { data: { incidents: [], units: [], users: [], resources: [], responders: [], tasks: [] } } }));
  let checks = 0;
  await page.route('**/api/auth/v1/me', async route => {
    checks += 1;
    if (checks > 1) await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: { data: { user: { id: 'admin', role: 'ADMIN', name: 'Test Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true } } } });
  });

  await page.goto('/admin/operations');
  await expect(page.getByRole('heading', { name: 'Operations management' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.getByText('Verifying authorized access…')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Operations management' })).toBeVisible();
});

test('a forged browser role cannot open any admin page', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', role: 'ADMIN', name: 'Forged Admin' }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({ status: 403, json: { message: 'Forbidden' } }));
  await page.route('**/api/auth/v1/refresh-token', route => route.fulfill({ status: 401, json: { message: 'No session' } }));

  await page.goto('/admin/operations');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Operations management' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
});

test('a citizen authenticated through the shared login cannot open an admin route', async ({ page }) => {
  await page.route('**/api/auth/v1/login', route => route.fulfill({ json: { status: 'success', data: { user: { id: 'citizen', name: 'Citizen', email: 'citizen@example.test', role: 'USER', permissions: ['incident:create-own'] } } } }));
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: { id: 'citizen', name: 'Citizen', email: 'citizen@example.test', role: 'USER', permissions: ['incident:create-own'] } } } }));
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await page.goto('/login');
  await page.getByLabel('Email').first().fill('citizen@example.test');
  await page.getByLabel('Password', { exact: true }).first().fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Log In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/admin/main-dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('invalid credentials stay in the shared login form without a console error overlay', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/api/auth/v1/login', route => route.fulfill({
    status: 401,
    json: { code: 401, status: 'error', message: 'Invalid email or password' },
  }));

  await page.goto('/login');
  await page.locator('input[type="email"]').fill('ADMIN@EMERGENCY.GOV');
  await page.locator('input[type="password"]').fill('wrong-password');
  await page.locator('form').getByRole('button', { name: 'Log In' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  expect(consoleErrors.filter(message => /AxiosError|Admin login error/i.test(message))).toEqual([]);
});

test('the shared Google callback routes an administrator by RBAC assignment', async ({ page }) => {
  let releaseSessionCheck!: () => void;
  const sessionCheckReleased = new Promise<void>((resolve) => {
    releaseSessionCheck = resolve;
  });
  await page.route('**/api/auth/v1/me', async route => {
    await sessionCheckReleased;
    await route.fulfill({ json: { data: { user: { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'ADMIN', department: 'MAIN', isMainAdmin: true, permissions: ['incident:manage-all'] } } } });
  });
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await page.goto('/login?oauth=success&token=legacy-token-that-must-not-remain');

  await expect(page.getByRole('heading', { name: 'Finishing sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toHaveCount(0);
  releaseSessionCheck();

  await expect(page).toHaveURL(/\/admin\/main-dashboard$/);
  expect(page.url()).not.toContain('token=');
});

test('a Google callback without a usable cookie stays on sign-in and explains the failure', async ({ page }) => {
  await page.route('**/api/auth/v1/me', route => route.fulfill({ status: 401, json: { code: 401, status: 'error', message: 'Authentication required' } }));
  await page.route('**/api/auth/v1/refresh-token', route => route.fulfill({ status: 401, json: { code: 401, status: 'error', message: 'Authentication required' } }));

  await page.goto('/login?oauth=success');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Google login session could not be verified. Please try again.')).toBeVisible();
});

test('administrator logout ends the one shared session', async ({ page }) => {
  await page.addInitScript(() => {
    if (!location.pathname.startsWith('/admin')) return;
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', name: 'Admin', department: 'MAIN', isMainAdmin: true }));
  });
  await page.route('**/api/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: { id: 'admin', role: 'ADMIN', name: 'Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true } } } }));
  await page.route('**/api/auth/v1/logout', route => route.fulfill({ json: { status: 'success' } }));

  await page.goto('/admin/main-dashboard');
  await page.getByRole('button', { name: 'Logout' }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
});

test('Google OAuth ignores a previous admin token when the returning account is a user', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'previous-admin-token');
    localStorage.setItem('user', JSON.stringify({ id: 'old-admin', role: 'ADMIN' }));
  });
  let authorizationHeader: string | undefined;
  let incidentRequests = 0;
  await page.route('**/api/auth/v1/me', route => {
    authorizationHeader = route.request().headers().authorization;
    return route.fulfill({ json: { data: { user: { id: 'benedict', name: 'Benedict P. Mequiabas', email: 'benedictmequiabas@gmail.com', role: 'USER' } } } });
  });
  await page.route('**/api/incidents/v1/**', route => {
    incidentRequests += 1;
    return route.fulfill({ json: { data: { incidents: [] } } });
  });

  await page.goto('/login?oauth=success');

  await expect(page).toHaveURL(/\/dashboard$/);
  expect(authorizationHeader).toBeUndefined();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}').role)).toBe('USER');
  await expect.poll(() => incidentRequests).toBeGreaterThan(0);
});

test('citizen dashboard does not continuously poll while live events are connected', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'citizen-access');
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', role: 'USER', name: 'Citizen' }));
    // A finite mocked SSE response immediately disconnects, causing legitimate
    // reconnect catch-up reads. Keep one live stream for this polling test.
    class ConnectedStream { onopen: (() => void) | null = null; constructor() { Object.assign(window, { __connectedStream: this }); } addEventListener() {} close() {} }
    Object.defineProperty(window, 'EventSource', { value: ConnectedStream });
  });
  let incidentRequests = 0;
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'citizen', role: 'USER', name: 'Citizen', email: 'citizen@example.test' } } },
  }));
  await page.route('**/api/incidents/v1/**', route => {
    incidentRequests += 1;
    return route.fulfill({ json: { data: { incidents: [] } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/dashboard');
  await expect(page.getByText('Choose emergency type')).toBeVisible();
  await expect(page.getByText('No emergency reports', { exact: true })).toBeVisible();
  // Open only after the initial request settles, so API in-flight deduplication
  // cannot legitimately combine that read with the catch-up read.
  await page.evaluate(() => (window as unknown as { __connectedStream: { onopen: () => void } }).__connectedStream.onopen());
  await expect.poll(() => incidentRequests).toBe(2);
  await page.waitForTimeout(5_000);

  expect(incidentRequests).toBe(2); // initial list plus the one connection catch-up
});

test('citizen dashboard recovers when the incident API comes back online', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'citizen-access');
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', role: 'USER', name: 'Citizen' }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'citizen', role: 'USER', name: 'Citizen', email: 'citizen@example.test' } } },
  }));
  let apiAvailable = false;
  await page.route('**/api/incidents/v1/**', route => apiAvailable
    ? route.fulfill({ json: { data: { incidents: [] } } })
    : route.abort('failed'));
  await page.route('**/api/events/v1/stream', route => route.fulfill({ status: 503, body: '' }));

  await page.goto('/dashboard');
  await expect(page.getByRole('alert').getByText('Your reports could not be loaded.', { exact: false })).toBeVisible();
  apiAvailable = true;
  await page.getByRole('button', { name: 'Retry reports' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('No emergency reports')).toBeVisible();
});

test('passive dashboard mounts do not request push configuration before opt-in', async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', name: 'Test Admin', department: 'MAIN', isMainAdmin: true }));
  });
  let pushKeyRequests = 0;
  await page.route('**/api/notifications/v1/web-push-key', route => {
    pushKeyRequests += 1;
    return route.fulfill({ json: { data: { enabled: false, publicKey: null } } });
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'admin', role: 'ADMIN', name: 'Test Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true } } },
  }));
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
  await page.waitForTimeout(500);

  expect(pushKeyRequests).toBe(0);
});

test('police dashboard recovers after an incident-list outage', async ({ page }) => {
  await page.addInitScript(() => { class QuietStream { addEventListener() {} close() {} } Object.defineProperty(window, 'EventSource', { value: QuietStream }); });
  let policeRequests = 0;
  let monitorRequests = 0;
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'police-admin', role: 'ADMIN', name: 'Police Admin', email: 'police@example.test', department: 'POLICE', isMainAdmin: false } } },
  }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
  await page.route('**/api/incidents/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/attention')) {
      expect(url.searchParams.get('responseService')).toBe('POLICE');
      monitorRequests += 1;
      return route.fulfill({ json: { data: { items: [], hasMore: false } } });
    }
    policeRequests += 1;
    if (policeRequests <= 2) return route.fulfill({ status: 504, json: { message: 'Temporary database delay' } });
    return route.fulfill({ json: { data: { incidents: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
  });

  await page.goto('/admin/police-dashboard');
  await expect(page.getByRole('alert').getByText('Police emergencies could not be refreshed.', { exact: false })).toBeVisible();
  expect(monitorRequests).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  expect(policeRequests).toBeGreaterThanOrEqual(3);
});

test('medical monitor is department-scoped and pauses when another account signs in in a shared browser', async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'medical-admin', role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'medical-admin', role: 'ADMIN', name: 'Medical Admin', email: 'medical@example.test', department: 'MEDICAL', isMainAdmin: false } } },
  }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
  let monitorRequests = 0;
  await page.route('**/api/incidents/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/attention')) {
      expect(url.searchParams.get('responseService')).toBe('MEDICAL');
      monitorRequests += 1;
      return route.fulfill({ json: { data: { items: [], hasMore: false } } });
    }
    return route.fulfill({ json: { data: { incidents: [], pagination: { page: 1, limit: 5, total: 0, pages: 0 } } } });
  });

  await page.goto('/admin/medical-dashboard');
  await expect(page.getByText('Medical Emergency Dashboard', { exact: true })).toBeVisible();
  await expect.poll(() => monitorRequests).toBeGreaterThan(0);

  const otherTab = await context.newPage();
  await otherTab.goto('/login');
  await otherTab.evaluate(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'hazard-admin', role: 'ADMIN', department: 'DRRMO', isMainAdmin: false }));
    localStorage.setItem('emergency-session-generation', crypto.randomUUID());
  });

  await expect(page.getByText('Another account signed in to this browser.')).toBeVisible();
  await expect(page.getByText('Medical Emergency Dashboard', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Another account signed in to this browser.')).toBeVisible();
  await otherTab.close();
});

test('a pending medical read does not log a 403 after the browser account switches', async ({ page, context }) => {
  const medical = { id: 'medical-admin', role: 'ADMIN', name: 'Medical Admin', email: 'medical@example.test', department: 'MEDICAL', isMainAdmin: false };
  const fire = { id: 'fire-admin', role: 'ADMIN', name: 'Fire Admin', email: 'fire@example.test', department: 'FIRE', isMainAdmin: false };
  const warnings: string[] = [];
  let delayNextRead = false;
  let releaseRead!: () => void;
  let readStarted!: () => void;
  const heldRead = new Promise<void>(resolve => { releaseRead = resolve; });
  const readWasStarted = new Promise<void>(resolve => { readStarted = resolve; });
  page.on('console', message => {
    if (message.type() === 'warning' && /Failed to load medical emergencies|Incident monitor poll error/.test(message.text())) {
      warnings.push(message.text());
    }
  });
  await page.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), medical);
  await context.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: medical } } }));
  await context.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
  await context.route('**/api/incidents/v1/**', async route => {
    const url = new URL(route.request().url());
    if (delayNextRead && url.searchParams.get('responseService') === 'MEDICAL' && url.searchParams.get('includeTotal') !== 'false') {
      delayNextRead = false;
      readStarted();
      await heldRead;
      return route.fulfill({ status: 403, json: { code: 403, status: 'error', message: "Cannot filter another department's response state" } });
    }
    return route.fulfill({ json: { data: { incidents: [], pagination: { page: 1, limit: 5, total: 0, pages: 0 } } } });
  });

  await page.goto('/admin/medical-dashboard');
  await expect(page.getByText('Medical Emergency Dashboard', { exact: true })).toBeVisible();
  await expect(page.getByText('No responding medical emergencies at the moment.')).toBeVisible();
  delayNextRead = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await readWasStarted;

  const otherTab = await context.newPage();
  await otherTab.goto('/login');
  await otherTab.evaluate(user => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-session-generation', crypto.randomUUID());
  }, fire);
  await expect(page.getByText('Another account signed in to this browser.')).toBeVisible();
  releaseRead();
  await page.waitForTimeout(300);
  expect(warnings).toEqual([]);
  await otherTab.close();
});

test('failed police reads do not immediately retry queued same-view refreshes', async ({ page }) => {
  await page.addInitScript(() => { class QuietStream { addEventListener() {} close() {} } Object.defineProperty(window, 'EventSource', { value: QuietStream }); });
  const police = { id: 'police-admin', role: 'ADMIN', name: 'Police Admin', email: 'police@example.test', department: 'POLICE', isMainAdmin: false };
  let pageReads = 0;
  let delayNextRead = false;
  let releaseRead!: () => void;
  let readStarted!: () => void;
  const heldRead = new Promise<void>(resolve => { releaseRead = resolve; });
  const readWasStarted = new Promise<void>(resolve => { readStarted = resolve; });
  await page.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), police);
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: police } } }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
  await page.route('**/api/incidents/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/attention')) {
      return route.fulfill({ json: { data: { items: [], hasMore: false } } });
    }
    pageReads += 1;
    if (delayNextRead) {
      delayNextRead = false;
      readStarted();
      await heldRead;
      return route.fulfill({ status: 500, json: { code: 500, status: 'error', message: 'Temporary read failure' } });
    }
    return route.fulfill({ json: { data: { incidents: [], pagination: { page: 1, limit: 5, total: 0, pages: 0 } } } });
  });

  await page.goto('/admin/police-dashboard');
  await expect(page.getByText('Police Emergency Dashboard', { exact: true })).toBeVisible();
  await expect(page.getByText('No responding police emergencies at the moment.')).toBeVisible();
  delayNextRead = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await readWasStarted;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  releaseRead();
  await expect(page.getByRole('alert').getByText('Police emergencies could not be refreshed.', { exact: false })).toBeVisible();
  await page.waitForTimeout(300);
  expect(pageReads).toBe(2);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  expect(pageReads).toBe(3);
});

test('paused Police tab opens the current DRRMO account directly', async ({ page, context }) => {
  const police = { id: 'police-admin', role: 'ADMIN', name: 'Police Admin', email: 'police@example.test', department: 'POLICE', isMainAdmin: false };
  const hazard = { id: 'hazard-admin', role: 'ADMIN', name: 'Hazard Admin', email: 'hazard@example.test', department: 'DRRMO', isMainAdmin: false };
  let currentAccount = police;
  let policeRequests = 0;
  let hazardRequests = 0;
  let refreshRequests = 0;
  const dashboardWarnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning' && /Failed to load DRRMO emergencies|Incident monitor poll error/.test(message.text())) {
      dashboardWarnings.push(message.text());
    }
  });
  await page.addInitScript((user) => {
    localStorage.setItem('user', JSON.stringify(user));
  }, police);
  await context.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: currentAccount } } }));
  await context.route('**/api/incidents/v1/**', route => {
    const service = new URL(route.request().url()).searchParams.get('responseService');
    if (service === 'POLICE') policeRequests += 1;
    if (service === 'HAZARD') {
      hazardRequests += 1;
      if (hazardRequests === 1) return route.fulfill({ status: 401, json: { message: 'Expired access cookie' } });
    }
    return route.fulfill({ json: { data: { incidents: [], pagination: { page: 1, limit: 5, total: 0, pages: 0 } } } });
  });
  await context.route('**/api/auth/v1/refresh-token', route => {
    refreshRequests += 1;
    return route.fulfill({ json: { data: { user: hazard } } });
  });
  await context.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/admin/police-dashboard');
  await expect(page.getByText('Police Emergency Dashboard', { exact: true })).toBeVisible();
  await expect.poll(() => policeRequests).toBeGreaterThan(0);

  const otherTab = await context.newPage();
  await otherTab.goto('/login');
  currentAccount = hazard;
  await otherTab.evaluate((user) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-session-generation', crypto.randomUUID());
  }, hazard);
  await expect(page.getByText('Another account signed in to this browser.')).toBeVisible();
  const policeRequestsAtPause = policeRequests;

  await page.getByRole('button', { name: "Open current account's dashboard" }).click();
  await expect(page).toHaveURL(/\/admin\/drrmo-dashboard$/);
  await expect(page.getByText('Hazard Emergency Dashboard', { exact: true })).toBeVisible();
  await expect.poll(() => hazardRequests).toBeGreaterThanOrEqual(2);
  await expect.poll(() => refreshRequests).toBe(1);
  expect(dashboardWarnings).toEqual([]);
  expect(policeRequests).toBe(policeRequestsAtPause);
  await otherTab.close();
});

test('new department login waits for an in-flight refresh in another tab', async ({ page, context }) => {
  const police = { id: 'police-admin', role: 'ADMIN', name: 'Police Admin', email: 'police@example.test', department: 'POLICE', isMainAdmin: false };
  const hazard = { id: 'hazard-admin', role: 'ADMIN', name: 'Hazard Admin', email: 'hazard@example.test', department: 'DRRMO', isMainAdmin: false };
  let currentAccount = police;
  let expireNextCheck = false;
  let loginRequests = 0;
  let releaseRefresh!: () => void;
  let refreshStarted!: () => void;
  const refreshHeld = new Promise<void>(resolve => { releaseRefresh = resolve; });
  const refreshSeen = new Promise<void>(resolve => { refreshStarted = resolve; });
  await page.addInitScript((user) => localStorage.setItem('user', JSON.stringify(user)), police);
  await context.route('**/api/auth/v1/me', route => {
    if (expireNextCheck) {
      expireNextCheck = false;
      return route.fulfill({ status: 401, json: { message: 'Expired access cookie' } });
    }
    return route.fulfill({ json: { data: { user: currentAccount } } });
  });
  await context.route('**/api/auth/v1/refresh-token', async route => {
    refreshStarted();
    await refreshHeld;
    await route.fulfill({ json: { data: { user: police } } });
  });
  await context.route('**/api/auth/v1/login', route => {
    loginRequests += 1;
    currentAccount = hazard;
    return route.fulfill({ json: { data: { user: hazard } } });
  });
  await context.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await context.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/admin/police-dashboard');
  await expect(page.getByText('Police Emergency Dashboard', { exact: true })).toBeVisible();
  expireNextCheck = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshSeen;

  const otherTab = await context.newPage();
  await otherTab.goto('/login');
  await otherTab.getByLabel('Email').first().fill('hazard@example.test');
  await otherTab.getByLabel('Password', { exact: true }).first().fill('test-password');
  await otherTab.getByRole('button', { name: 'Log In', exact: true }).click();
  await otherTab.waitForTimeout(250);
  expect(loginRequests).toBe(0);

  releaseRefresh();
  await expect.poll(() => loginRequests).toBe(1);
  await expect(otherTab).toHaveURL(/\/admin\/drrmo-dashboard$/);
  await expect(page.getByText('Another account signed in to this browser.')).toBeVisible();
  await otherTab.close();
});

test('citizen polling stops when its session is removed', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'citizen-access');
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', role: 'USER', name: 'Citizen' }));
    class QuietStream { addEventListener() {} close() {} } Object.defineProperty(window, 'EventSource', { value: QuietStream });
  });
  let incidentRequests = 0;
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'citizen', role: 'USER', name: 'Citizen', email: 'citizen@example.test' } } },
  }));
  await page.route('**/api/incidents/v1/**', route => {
    incidentRequests += 1;
    return route.fulfill({ json: { data: { incidents: [] } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/dashboard');
  await expect(page.getByText('Choose emergency type')).toBeVisible();
  await expect.poll(() => incidentRequests).toBe(1);

  await page.evaluate(() => {
    const epoch = crypto.randomUUID();
    localStorage.setItem('emergency-logout-epoch', epoch);
    window.dispatchEvent(new StorageEvent('storage', { key: 'emergency-logout-epoch', newValue: epoch }));
  });
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(500);

  expect(incidentRequests).toBe(1);
});

test('admin data polling stops when its session is removed', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', name: 'Test Admin', department: 'MAIN', isMainAdmin: true }));
  });
  let incidentRequests = 0;
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'admin', role: 'ADMIN', name: 'Test Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true } } },
  }));
  await page.route('**/api/incidents/v1/**', route => {
    incidentRequests += 1;
    if (new URL(route.request().url()).pathname.endsWith('/review-flags')) return route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
    return route.fulfill({ json: { data: { incidents: [] } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
  await expect.poll(() => incidentRequests).toBeGreaterThan(0);
  // Wait for the new queue's initial read before measuring requests after logout.
  await expect(page.getByText('No pending or confirmed review flags.')).toBeVisible();
  const requestsBeforeLogout = incidentRequests;

  await page.evaluate(() => {
    const epoch = crypto.randomUUID();
    localStorage.setItem('emergency-logout-epoch', epoch);
    window.dispatchEvent(new StorageEvent('storage', { key: 'emergency-logout-epoch', newValue: epoch }));
  });
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(500);

  expect(incidentRequests).toBe(requestsBeforeLogout);
});

test('logout during an in-flight admin recheck cannot restore the dashboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
  });
  let delayNextCheck = false;
  let releaseCheck!: () => void;
  const pendingCheck = new Promise<void>(resolve => { releaseCheck = resolve; });
  let recheckStarted!: () => void;
  const recheck = new Promise<void>(resolve => { recheckStarted = resolve; });
  await page.route('**/api/auth/v1/me', async route => {
    if (delayNextCheck) {
      delayNextCheck = false;
      recheckStarted();
      await pendingCheck;
    }
    await route.fulfill({ json: { data: { user: { id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true } } } });
  });
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));

  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
  delayNextCheck = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await recheck;
  await page.evaluate(() => localStorage.setItem('emergency-logout-epoch', crypto.randomUUID()));
  releaseCheck();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toHaveCount(0);
});

test('expired admin cookie refreshes after a 401 without exposing a bearer token', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', name: 'Test Admin', department: 'MAIN', isMainAdmin: true }));
  });

  let refreshRequests = 0;
  let sessionChecks = 0;
  const protectedHeaders: Array<string | undefined> = [];
  await page.route('**/api/auth/v1/refresh-token', route => {
    refreshRequests += 1;
    return route.fulfill({ json: { data: { user: { id: 'admin', role: 'ADMIN' } } } });
  });
  await page.route('**/api/auth/v1/me', route => {
    sessionChecks += 1;
    protectedHeaders.push(route.request().headers().authorization);
    if (refreshRequests === 0) return route.fulfill({ status: 401, json: { message: 'Expired access cookie' } });
    return route.fulfill({ json: { data: { user: { id: 'admin', role: 'ADMIN', name: 'Test Admin', email: 'admin@example.test', department: 'MAIN', isMainAdmin: true } } } });
  });
  await page.route('**/api/incidents/v1/**', route => {
    protectedHeaders.push(route.request().headers().authorization);
    return route.fulfill({ json: { data: { incidents: [] } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Main Admin Dashboard', { exact: true })).toBeVisible();
  expect(refreshRequests).toBe(1);
  expect(sessionChecks).toBeGreaterThanOrEqual(3);
  expect(protectedHeaders.length).toBeGreaterThan(0);
  expect(protectedHeaders.every(header => header === undefined)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
});

test('expired citizen cookie refreshes after a 401 without storing credentials', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', role: 'USER', name: 'Citizen' }));
  });

  let refreshRequests = 0;
  const protectedHeaders: Array<string | undefined> = [];
  await page.route('**/api/auth/v1/refresh-token', route => {
    refreshRequests += 1;
    return route.fulfill({ json: { data: { user: { id: 'citizen', role: 'USER' } } } });
  });
  await page.route('**/api/auth/v1/me', route => {
    protectedHeaders.push(route.request().headers().authorization);
    if (refreshRequests === 0) return route.fulfill({ status: 401, json: { message: 'Expired access cookie' } });
    return route.fulfill({ json: { data: { user: { id: 'citizen', role: 'USER', name: 'Citizen', email: 'citizen@example.test' } } } });
  });
  await page.route('**/api/incidents/v1/**', route => {
    protectedHeaders.push(route.request().headers().authorization);
    return route.fulfill({ json: { data: { incidents: [] } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/dashboard');
  await expect(page.getByText('Choose emergency type')).toBeVisible();
  await expect.poll(() => refreshRequests).toBe(1);
  await expect.poll(() => protectedHeaders.length).toBeGreaterThan(0);
  expect(protectedHeaders.every(header => header === undefined)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('refreshToken'))).toBeNull();
});
