import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Reproducible preview of the actual Dashboard. No real identity, evidence, geolocation, or network API.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'reduce' });
const user = { id: 'demo-citizen', name: 'Demo citizen', email: 'demo@example.test', role: 'USER', status: 'ACTIVE' };
await page.addInitScript(user => {
 localStorage.setItem('user', JSON.stringify(user));
 localStorage.setItem('emergency-response-theme', 'light');
 class Stream extends EventTarget { close() {} }
 Object.assign(window, { EventSource: Stream });
 Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
   getCurrentPosition(_success, failure) { failure({ code: 1, message: 'Location not requested in this preview.' }); },
   watchPosition() { return 1; }, clearWatch() {},
 }});
}, user);
await page.route('**/api/**', route => {
 if (route.request().method() !== 'GET') return route.fulfill({ status: 403, json: { message: 'Demo capture forbids mutations' } });
 return route.fulfill({ json: { data: { user, incidents: [], alerts: [], hasMore: false,
   pagination: { page: 1, limit: 10, total: 0, pages: 1 }, summary: { total: 0, active: 0, resolved: 0 } } } });
});
await page.route('https://**', route => route.abort());
await page.goto(process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:3114/dashboard');
await page.getByRole('heading', { name: 'Choose emergency type' }).waitFor();
await page.getByText('No emergency reports', { exact: true }).waitFor();
await page.evaluate(() => document.fonts.ready);
await page.locator('nextjs-portal').evaluateAll(elements => elements.forEach(element => element.remove()));
await mkdir(resolve('public/images'), { recursive: true });
await page.screenshot({ path: resolve('public/images/citizen-dashboard-preview.png') });
await browser.close();
console.log('Synthetic citizen dashboard preview captured; all API traffic intercepted.');
