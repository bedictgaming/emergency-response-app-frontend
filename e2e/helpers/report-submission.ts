import { expect, type Page } from '@playwright/test';
import { captureIncidentPhoto, installFakeIncidentCamera } from './incident-camera';

export const submissionUser = { id: '10000000-0000-4000-8000-000000000001', role: 'USER', name: 'Synthetic citizen', status: 'ACTIVE' };
export const submittedIncident = { incidentId: '20000000-0000-4000-8000-000000000002', title: 'Synthetic confirmed fire report',
  description: 'Synthetic description, not a real emergency.', reportedBy: submissionUser.id, status: 'RESPONDING', verificationStatus: 'VERIFIED',
  reportedAt: '2026-10-24T04:00:00.000Z', updatedAt: '2026-10-24T04:00:00.000Z', requestedServices: ['FIRE'],
  type: { typeName: 'Fire Outbreak' }, location: { locationName: 'Synthetic location' }, attachments: [] };

export async function submissionFixture(page: Page) {
  const state = { created: false, commitAt: 0, createCalls: 0, holdRefresh: true, refreshStarted: false, refreshFailed: false,
    holdUpload: false, holdCreate: false, holdOldRead: false, uploadFailed: false, createFailed: false, deactivate: false,
    oldReadStarted: false, invalidReceipt: false, networkCreateFailed: false, fallbackCalls: 0,
    uploaded: 0, signatures: 0, reads: 0, order: [] as string[], releaseRefresh: (() => {}) as () => void,
    releaseUpload: (() => {}) as () => void, releaseCreate: (() => {}) as () => void, releaseOld: (() => {}) as () => void };
  await installFakeIncidentCamera(page);
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('emergency-response-theme', 'light');
    Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
    Object.defineProperty(navigator.geolocation, 'watchPosition', { configurable: true, value: (success: PositionCallback) => setTimeout(() => success({
      coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 25 }, timestamp: Date.now(),
    } as GeolocationPosition), 0) });
    Object.defineProperty(navigator.geolocation, 'clearWatch', { configurable: true, value: (id: number) => clearTimeout(id) });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { configurable: true, value: (success: PositionCallback) => setTimeout(() => success({
      coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 25 }, timestamp: Date.now(),
    } as GeolocationPosition), 0) });
  }, submissionUser);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peer.onMessage(message => { if (message === '40') peer.send('40{"sid":"synthetic-submit"}'); });
    peer.send('0{"sid":"synthetic-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: { address: { town: 'Cordova', suburb: 'Poblacion', province: 'Cebu' } } }));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/></svg>' }));
  await page.route('https://api.cloudinary.com/**', async route => {
    state.uploaded++; state.order.push('upload'); if (state.holdUpload) await new Promise<void>(resolve => { state.releaseUpload = resolve; });
    return route.fulfill({ status: state.uploadFailed ? 500 : 200, json: { public_id: `evidence/${submissionUser.id}/synthetic-photo`, secure_url: 'https://example.invalid/private-photo.jpg', format: 'jpg', bytes: 100, width: 640, height: 480 } });
  });
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user: submissionUser } } });
    if (path.endsWith('/upload/v1/image')) { state.fallbackCalls++; return route.fulfill({ status: 503, json: { message: 'Synthetic fallback unavailable' } }); }
    if (path.endsWith('/upload/v1/signature')) { state.signatures++; state.order.push('signature'); return route.fulfill({ json: { data: {
      cloudName: 'synthetic', apiKey: 'synthetic', signature: 'synthetic', timestamp: 1, folder: `evidence/${submissionUser.id}`, publicId: 'synthetic-photo', allowed_formats: 'jpg,jpeg,png,webp,heic', type: 'authenticated',
    } } }); }
    if (path.endsWith('/nearby-check')) { state.order.push('nearby'); return route.fulfill({ json: { data: { duplicate: false, locationAccepted: true, barangayName: 'Poblacion' } } }); }
    if (path === '/api/incidents/v1' && req.method() === 'POST') {
      state.createCalls++; state.order.push('save'); if (state.holdCreate) await new Promise<void>(resolve => { state.releaseCreate = resolve; });
      if (state.networkCreateFailed) return route.abort('failed');
      if (state.createFailed) return route.fulfill({ status: 409, json: { message: 'Synthetic conflict; report not confirmed.' } });
      state.created = true; state.commitAt = Date.now();
      return route.fulfill({ status: 201, json: { data: { incident: state.invalidReceipt ? {} : submittedIncident, accountDeactivated: state.deactivate } } });
    }
    if (path === '/api/incidents/v1' && req.method() === 'GET') {
      state.reads++; const wasCreated = state.created;
      if (!wasCreated && state.holdOldRead) { state.holdOldRead = false; state.oldReadStarted = true; await new Promise<void>(resolve => { state.releaseOld = resolve; }); }
      if (wasCreated) {
        state.refreshStarted = true;
        if (state.holdRefresh) await new Promise<void>(resolve => { state.releaseRefresh = resolve; });
        if (state.refreshFailed) return route.fulfill({ status: 500, json: { message: 'Synthetic read outage' } });
      }
      return route.fulfill({ json: { data: { incidents: wasCreated ? [submittedIncident] : [] } } });
    }
    if (path.endsWith('/report-reviews')) return route.fulfill({ json: { data: { items: [], limit: 50, hasMore: false } } });
    return route.fulfill({ json: { data: { items: [], enabled: false, nearby: false, complete: true, radiusMeters: 100 } } });
  });
  return state;
}
export async function prepareSubmission(page: Page) {
  await page.goto('/dashboard'); await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await page.getByLabel('Description of Incident').fill('Synthetic controlled report, not a real emergency.');
  await page.getByLabel('Contact Number').fill('09000000000');
  await expect(page.getByRole('button', { name: 'Confirm GPS location' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm GPS location' }).click();
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await captureIncidentPhoto(page);
}
