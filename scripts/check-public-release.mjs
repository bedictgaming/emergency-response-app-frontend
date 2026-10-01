// Read-only anonymous post-launch smoke. No accounts, submissions or secret cookies.
import { chromium, devices } from '@playwright/test';
const origin = 'https://cordova-emergency-response.vercel.app';
const protectedPreview = 'https://emergency-response-6mpeihbjc-benedict-mequiabas-projects.vercel.app';
function must(condition, label) { if (!condition) throw new Error(label); }
async function get(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const body = await response.text();
  return { response, body };
}
let browser, step = 'HTTP_ACCESS';
try {
  // Protection changes propagate at the edge; bound the readiness wait.
  let ready = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const { response } = await get(origin + '/');
    if (response.status === 200) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  must(ready, 'PUBLIC_DOMAIN_NOT_READY');
  for (const path of ['/', '/login', '/manifest.webmanifest']) {
    const { response, body } = await get(origin + path);
    must(response.status === 200 && !response.headers.has('location'), 'PUBLIC_PAGE_BLOCKED');
    if (path.includes('manifest')) must(JSON.parse(body).name && response.headers.get('content-type')?.includes('manifest'), 'MANIFEST_INVALID');
    console.log(JSON.stringify({ path, anonymousStatus: response.status }));
  }
  for (const path of ['/api/auth/v1/me', '/api/incidents/v1/?limit=5', '/api/users/v1/',
    '/api/attachments/v1/00000000-0000-4000-8000-000000000000/content']) {
    const { response } = await get(origin + path);
    must(response.status === 401 && response.headers.get('cache-control') === 'no-store', 'PRIVATE_API_NOT_PROTECTED');
  }
  const alerts = await get(origin + '/api/alerts/v1/');
  must(alerts.response.status === 200 && alerts.response.headers.get('cache-control') === 'no-store', 'PUBLIC_ALERTS_FAILED');
  const preview = await get(protectedPreview + '/');
  must(preview.response.status === 302 && preview.response.headers.get('location')?.startsWith('https://vercel.com/'), 'PREVIEW_NOT_PROTECTED');
  for (const path of ['/healthz', '/readyz', '/api/auth/v1/me']) {
    const { response } = await get('https://api-production-49dea.up.railway.app' + path);
    must(response.status === (path.startsWith('/api') ? 403 : 200), 'BACKEND_BOUNDARY_OR_READINESS_FAILED');
  }
  browser = await chromium.launch({ headless: true });
  for (const [name, options] of [['desktop', {}], ['mobile-emulation', devices['Pixel 7']]]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    step = `${name}_LOGIN_PAGE`;
    await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue with Google/i }).waitFor({ state: 'visible' });
    step = `${name}_CITIZEN_REDIRECT`;
    await page.goto(origin + '/dashboard', { waitUntil: 'domcontentloaded' });
    // Existing citizen/admin guards send an absent session to the landing page.
    await page.waitForURL(origin + '/', { timeout: 20000 });
    step = `${name}_ADMIN_REDIRECT`;
    await page.goto(origin + '/admin/main-dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(origin + '/', { timeout: 20000 });
    await context.close();
    console.log(JSON.stringify({ browser: name, publicLoginAndAnonymousDashboardDenialPassed: true }));
  }
  console.log(JSON.stringify({ passed: true, publicProductionVerified: true, previewsProtected: true,
    anonymousPrivateDataDenied: true, physicalAuthenticatedChecksReportedSeparately: true }));
} catch (error) {
  console.error(JSON.stringify({ passed: false, step, errorType: error.name,
    reason: /^[A-Z_]{1,80}$/.test(error.message || '') ? error.message : 'PUBLIC_BROWSER_CHECK_FAILED' }));
  process.exitCode = 1;
} finally { await browser?.close(); }
