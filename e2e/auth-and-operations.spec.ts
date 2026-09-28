import { expect, test } from '@playwright/test';

test('login and signup use an equal-width segmented control', async ({ page }) => {
  await page.goto('/login');
  const loginTab = page.getByRole('tab', { name: 'Login' });
  const signupTab = page.getByRole('tab', { name: 'Sign Up' });
  const [loginBox, signupBox] = await Promise.all([loginTab.boundingBox(), signupTab.boundingBox()]);

  expect(loginBox).not.toBeNull();
  expect(signupBox).not.toBeNull();
  expect(Math.abs(loginBox!.width - signupBox!.width)).toBeLessThanOrEqual(1);
  await signupTab.click();
  await expect(signupTab).toHaveAttribute('aria-selected', 'true');
  await loginTab.click();
  await expect(loginTab).toHaveAttribute('aria-selected', 'true');
});

test('login is blank by default and password reset is usable', async ({ page }) => {
  await page.route('**/api/auth/v1/password-reset/request', async (route) => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ message: 'If that account exists, password-reset instructions have been sent' }) });
  });
  await page.goto('/login');
  await expect(page.getByLabel('Email').first()).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true }).first()).toHaveValue('');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill('citizen@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('password-reset instructions');
});

test('emailed password-reset link opens the reset form and confirms the new password', async ({ page }) => {
  const token = 'a'.repeat(64);
  let confirmation: { token: string; password: string } | undefined;
  await page.route('**/api/auth/v1/password-reset/confirm', async route => {
    confirmation = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, status: 'success', message: 'Password reset successfully' }),
    });
  });

  await page.goto(`/login?resetToken=${token}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('New password').fill('NewPassword123');
  await page.getByRole('button', { name: 'Set new password' }).click();

  await expect.poll(() => confirmation).toEqual({ token, password: 'NewPassword123' });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Password reset successfully');
});

test('previously emailed root reset links redirect to the unified reset form', async ({ page }) => {
  const token = 'b'.repeat(64);

  await page.goto(`/?resetToken=${token}`);

  await expect(page).toHaveURL(`/login?resetToken=${token}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
});

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
  await page.getByRole('button', { name: 'Resolve Incident (Main Admin Override)' }).click();
  await expect.poll(() => resolutionRequests).toBe(1);
  await expect(page.getByText('✓ Incident Resolved', { exact: true })).toBeVisible();
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
    && url.searchParams.get('includeServiceSummary') === 'true'
  )).toBe(true);
  expect(requestedUrls.some(url =>
    url.searchParams.get('limit') === '5'
    && url.searchParams.get('statuses') === 'RESOLVED,CLOSED'
  )).toBe(true);
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
  await page.locator('form').getByRole('button', { name: 'Login' }).click();
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
  await page.locator('form').getByRole('button', { name: 'Login' }).click();

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
  await page.waitForTimeout(5_000);

  expect(incidentRequests).toBe(1);
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
    if (url.searchParams.get('includeTotal') === 'false') {
      expect(url.searchParams.get('responseService')).toBe('POLICE');
      monitorRequests += 1;
      return route.fulfill({ json: { data: { incidents: [] } } });
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
    if (url.searchParams.get('includeTotal') === 'false') {
      expect(url.searchParams.get('responseService')).toBe('MEDICAL');
      monitorRequests += 1;
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
    if (url.searchParams.get('includeTotal') === 'false') {
      return route.fulfill({ json: { data: { incidents: [] } } });
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
  await otherTab.getByRole('button', { name: 'Login', exact: true }).click();
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
