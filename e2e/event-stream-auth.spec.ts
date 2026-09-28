import { expect, test } from '@playwright/test';

const citizen = {
  id: 'citizen', role: 'USER', name: 'Citizen', email: 'citizen@example.test', permissions: [],
};

test('a revoked session stops SSE reconnects instead of repeating 401 requests', async ({ page }) => {
  let streamRequests = 0;
  let refreshRequests = 0;

  await page.route('**/api/auth/v1/me', route => route.fulfill(
    streamRequests === 0
      ? { json: { data: { user: citizen } } }
      : { status: 401, json: { code: 401, status: 'error', message: 'Session expired' } },
  ));
  await page.route('**/api/auth/v1/refresh-token', route => {
    refreshRequests += 1;
    return route.fulfill({ status: 401, json: { code: 401, status: 'error', message: 'Session expired' } });
  });
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await page.route('**/api/events/v1/stream', route => {
    streamRequests += 1;
    return route.fulfill({ status: 401, json: { code: 401, status: 'error', message: 'Session expired' } });
  });

  await page.goto('/dashboard');
  await expect.poll(() => streamRequests).toBe(1);
  await expect.poll(() => refreshRequests).toBe(1);
  await expect(page).toHaveURL('/');
  await page.waitForTimeout(2_500);
  expect(streamRequests).toBe(1);
});

test('an expired access cookie refreshes before SSE reconnects', async ({ page }) => {
  let streamRequests = 0;
  let refreshRequests = 0;
  let refreshed = false;

  await page.route('**/api/auth/v1/me', route => route.fulfill(
    streamRequests > 0 && !refreshed
      ? { status: 401, json: { code: 401, status: 'error', message: 'Access expired' } }
      : { json: { data: { user: citizen } } },
  ));
  await page.route('**/api/auth/v1/refresh-token', route => {
    refreshRequests += 1;
    refreshed = true;
    return route.fulfill({ json: { data: { user: citizen } } });
  });
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [] } } }));
  await page.route('**/api/events/v1/stream', route => {
    streamRequests += 1;
    return route.fulfill(streamRequests === 1
      ? { status: 401, json: { code: 401, status: 'error', message: 'Access expired' } }
      : { status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n' });
  });

  await page.goto('/dashboard');
  await expect.poll(() => refreshRequests).toBe(1);
  await expect.poll(() => streamRequests).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Choose emergency type')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});
