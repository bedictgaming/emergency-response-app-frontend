import { expect, test, type Page } from '@playwright/test';

async function session(page: Page, role = 'ADMIN') {
  if (role === 'USER') {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 10.252191, longitude: 123.949475, accuracy: 25 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
        configurable: true,
        value: (success: PositionCallback) => setTimeout(() => success({
          coords: { latitude: 10.252191, longitude: 123.949475, accuracy: 25 }, timestamp: Date.now(),
        } as GeolocationPosition), 0),
      });
    });
  }
  await page.addInitScript(role => {
    const isAdmin = role === 'ADMIN' || role === 'DISPATCHER';
    localStorage.setItem('user', JSON.stringify({ id: 'test-user', name: 'Test User', role, permissions: [], ...(isAdmin && { department: 'MAIN', isMainAdmin: role === 'ADMIN' }) }));
  }, role);
  await page.route('**/api/**', route => {
    const section = new URL(route.request().url()).pathname.split('/')[2];
    const isAdmin = role === 'ADMIN' || role === 'DISPATCHER';
    return route.fulfill({ json: { data: { [section]: [], user: { id: 'test-user', name: 'Test User', role, ...(isAdmin && { department: 'MAIN', isMainAdmin: role === 'ADMIN' }) } } } });
  });
}

async function confirmEmergencyMapPin(page: Page) {
  await page.getByRole('button', { name: 'Confirm GPS location' }).click();
  await expect(page.getByText('Location confirmed', { exact: true })).toBeVisible();
}

test('public emergency telephone actions use only the verified 911 target', async ({ page }) => {
  await page.goto('/');

  const telephoneLinks = page.locator('a[href^="tel:"]');
  await expect(telephoneLinks).not.toHaveCount(0);
  const targets = await telephoneLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')));

  expect(new Set(targets)).toEqual(new Set(['tel:911']));
  await expect(page.getByText(/0917-123-|496-8000|496-8555|238-3482|236-0001/)).toHaveCount(0);
});

test('citizen emergency choices, evidence, and GPS confirmation are keyboard reachable', async ({ page }) => {
  await session(page, 'USER');
  await page.goto('/dashboard');

  const fireChoice = page.getByRole('button', { name: 'Report a fire emergency' });
  await fireChoice.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use camera' })).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Confirm GPS location' });
  await expect(confirm).toBeEnabled();
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Location confirmed', { exact: true })).toBeVisible();
});

test('citizen can capture evidence in the form and camera stops after capture', async ({ page }) => {
  await session(page, 'USER');
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        sessionStorage.setItem('cameraStarts', String(Number(sessionStorage.getItem('cameraStarts') || 0) + 1));
        const stream = new MediaStream();
        Object.defineProperty(stream, 'getTracks', {
          value: () => [{ stop: () => sessionStorage.setItem('cameraStops', String(Number(sessionStorage.getItem('cameraStops') || 0) + 1)) }],
        });
        return stream;
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    CanvasRenderingContext2D.prototype.drawImage = () => {};
  });

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('cameraStarts'))).toBeNull();
  await page.getByRole('button', { name: 'Use camera' }).click();
  await expect(page.getByRole('group', { name: 'Camera preview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photo' })).toBeVisible();
  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('cameraStops'))).toBe('1');
  await page.getByRole('button', { name: 'Use camera' }).click();
  await page.getByLabel('Live camera view').dispatchEvent('canplay');
  await page.getByRole('button', { name: 'Take picture' }).click();
  await expect(page.getByAltText('Incident evidence preview')).toBeVisible();
  await expect(page.getByText(/incident-camera-.*\.jpg/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('cameraStops'))).toBe('2');
  await page.getByRole('button', { name: 'Remove selected photo' }).click();
  await expect(page.getByRole('button', { name: 'Use camera' })).toBeVisible();
});

test('camera permission failure leaves photo picker available', async ({ page }) => {
  await session(page, 'USER');
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
    });
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Report a fire emergency' }).click();
  await page.getByRole('button', { name: 'Use camera' }).click();
  await expect(page.getByText(/Camera access was denied/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photo' })).toBeVisible();
  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect(page.getByRole('button', { name: 'Use camera' })).toBeVisible();
});

test('responder primary task action is visible and submits only one update', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'responder', name: 'Field Responder', role: 'RESPONDER' }));
  });
  const task = {
    taskId: 'task-1',
    taskName: 'Assess scene',
    description: 'Confirm the area is safe.',
    priority: 'HIGH',
    status: 'PENDING',
    incident: { incidentId: 'incident-1', title: 'Fire response', severityLevel: 'HIGH', status: 'RESPONDING' },
  };
  let taskUpdates = 0;
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'responder', name: 'Field Responder', email: 'responder@example.test', role: 'RESPONDER' } } },
  }));
  await page.route('**/api/tasks/v1/**', async route => {
    if (route.request().method() === 'PUT') {
      taskUpdates += 1;
      await new Promise(resolve => setTimeout(resolve, 150));
      return route.fulfill({ json: { data: { task: { ...task, status: 'IN_PROGRESS' } } } });
    }
    return route.fulfill({ json: { data: { tasks: [task] } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));

  await page.goto('/responder/tasks');
  const startTask = page.getByRole('button', { name: 'Start task' });
  await expect(startTask).toBeVisible();
  expect(await startTask.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await startTask.dblclick();

  await expect(page.getByRole('button', { name: 'Mark done' })).toBeVisible();
  expect(taskUpdates).toBe(1);
});

test('unit management creates, edits and confirms deletion', async ({ page }) => {
  await session(page);
  let unit: Record<string, unknown> | undefined;
  await page.route('**/api/units/v1/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') unit = { unitId: 'test-unit', ...request.postDataJSON() };
    if (request.method() === 'PUT') unit = { ...unit, ...request.postDataJSON() };
    if (request.method() === 'DELETE') unit = undefined;
    await route.fulfill({ json: { data: { units: unit ? [unit] : [], unit } } });
  });
  await page.goto('/admin/operations');
  await page.getByRole('button', { name: 'Add units', exact: true }).click();
  await page.getByLabel('Unit name', { exact: true }).fill('Ambulance 1');
  await page.getByLabel('Unit type', { exact: true }).fill('MEDICAL');
  await page.getByLabel('Status', { exact: true }).selectOption('AVAILABLE');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ambulance 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Ambulance 1', exact: true }).click();
  await page.getByLabel('Unit name', { exact: true }).fill('Ambulance 2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Ambulance 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ambulance 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ambulance 2', exact: true })).toHaveCount(0);
});

test('dispatcher cannot edit resources or responders', async ({ page }) => {
  await session(page, 'DISPATCHER');
  await page.goto('/admin/operations');
  await expect(page.getByRole('button', { name: 'Add units', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add resources', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add responders', exact: true })).toHaveCount(0);
});

test('medical dashboard exposes only verified incidents and prevents duplicate status requests', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'medical-admin', name: 'Medical Admin', email: 'medical@example.test', role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false }));
  });
  const makeIncident = (id: string, title: string, verificationStatus: 'PENDING' | 'VERIFIED') => ({
    incidentId: id, title, description: '', typeId: 'type', locationId: 'location', severityLevel: 'HIGH',
    status: 'OPEN', verificationStatus, reportedBy: 'citizen', reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    type: { typeId: 'type', typeName: 'Medical' }, location: { locationId: 'location', locationName: 'Poblacion' }, attachments: [],
  });
  let serviceUpdates = 0;
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: { id: 'medical-admin', name: 'Medical Admin', email: 'medical@example.test', role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false, permissions: ['incident:manage-department'] } } } }));
  await page.route('**/api/incidents/v1/**', async route => {
    if (route.request().method() === 'PATCH') {
      serviceUpdates += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ json: { data: { serviceResponse: { service: 'MEDICAL', status: 'RESPONDING' } } } });
    }
    return route.fulfill({ json: { data: { incidents: [makeIncident('pending', 'Pending medical report', 'PENDING'), makeIncident('verified', 'Verified medical report', 'VERIFIED')] } } });
  });
  await page.goto('/admin/medical-dashboard');
  await expect(page.getByText('Verified medical report')).toBeVisible();
  await expect(page.getByText('Pending medical report')).toHaveCount(0);
  // Wait for the async request to complete before counting it; dblclick returning
  // does not guarantee that Axios has reached the intercepted route yet.
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'PATCH'
      && response.url().includes('/api/incidents/v1/')),
    page.getByRole('button', { name: 'Dispatch Ambulance / Mark Responding' }).dblclick(),
  ]);
  await expect(page.getByRole('button', { name: 'Dispatch Ambulance / Mark Responding' })).toBeEnabled();
  expect(serviceUpdates).toBe(1);
});

test('citizen proof upload precedes submission and failed uploads retain the draft', async ({ page }) => {
  await session(page, 'USER');
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }));
  const order: string[] = [];
  let failUpload = true;
  await page.route('**/api/upload/v1/signature', async route => {
    order.push('signature');
    await route.fulfill({ json: { data: { cloudName: 'test', apiKey: 'test', timestamp: 1, folder: 'evidence/test-user', publicId: 'photo', allowed_formats: 'jpg,jpeg,png,webp,heic', signature: 'test', type: 'authenticated' } } });
  });
  await page.route('https://api.cloudinary.com/**', async route => {
    order.push('upload');
    expect(new URL(route.request().url()).pathname).toBe('/v1_1/test/image/upload');
    expect(route.request().postDataBuffer()?.toString()).toContain('name="type"\r\n\r\nauthenticated');
    expect(route.request().postDataBuffer()?.toString()).toContain('name="overwrite"\r\n\r\nfalse');
    expect(route.request().postDataBuffer()?.toString()).toContain('name="public_id"\r\n\r\nphoto');
    await route.fulfill({ status: failUpload ? 500 : 200, json: { public_id: 'evidence/test-user/photo', secure_url: 'https://example.test/photo.png', format: 'png', bytes: 68, width: 1, height: 1 } });
  });
  await page.route('**/api/incidents/v1/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/nearby-check')) {
      return route.fulfill({ json: { data: { duplicate: false } } });
    }
    if (route.request().method() === 'POST') {
      order.push('incident');
      expect(route.request().postDataJSON().proofAttachment).toEqual({ publicId: 'evidence/test-user/photo', fileName: 'proof.png' });
      expect(route.request().postDataJSON().barangayName).toBe('Poblacion');
      expect(route.request().postDataJSON()).toMatchObject({ latitude: 10.252191, longitude: 123.949475 });
    }
    await route.fulfill({ json: { data: { incidents: [], incident: {} } } });
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Delete report' })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await page.getByLabel('Description of Incident').fill('Smoke coming from a building');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  await expect(page.getByLabel('Exact Location')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText('A current proof photo is required to submit a citizen report', { exact: true })).toBeVisible();
  expect(order).toEqual([]);
  await page.locator('input[type="file"]').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText('Photo upload failed: Secure image upload failed', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Description of Incident')).toHaveValue('Smoke coming from a building');
  expect(order).toEqual(['signature', 'upload']);
  failUpload = false;
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submit Report', exact: true })).toHaveCount(0);
  expect(order).toEqual(['signature', 'upload', 'signature', 'upload', 'incident']);
});

test('citizen photo upload falls back securely when the browser blocks Cloudinary', async ({ page }) => {
  await session(page, 'USER');
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }));
  await page.route('**/api/upload/v1/signature', route => route.fulfill({
    json: { data: { cloudName: 'test', apiKey: 'test', timestamp: 1, folder: 'evidence/test-user', publicId: 'photo', allowed_formats: 'jpg,jpeg,png,webp,heic', signature: 'test', type: 'authenticated' } },
  }));
  await page.route('https://api.cloudinary.com/**', route => route.abort('failed'));

  let fallbackUploads = 0;
  let incidentCreated = false;
  await page.route('**/api/upload/v1/image', route => {
    fallbackUploads += 1;
    const body = route.request().postDataJSON();
    expect(body.fileName).toBe('proof.png');
    expect(body.imageData).toMatch(/^data:image\/png;base64,/);
    return route.fulfill({
      json: { data: { url: 'https://example.test/fallback.png', publicId: 'emergency-incidents/test-user/fallback', format: 'png', bytes: 68, width: 1, height: 1, fileName: 'proof.png' } },
    });
  });
  await page.route('**/api/incidents/v1/**', route => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/nearby-check')) {
      return route.fulfill({ json: { data: { duplicate: false } } });
    }
    if (request.method() === 'POST') {
      incidentCreated = true;
      expect(request.postDataJSON().proofAttachment).toEqual({
        publicId: 'emergency-incidents/test-user/fallback',
        fileName: 'proof.png',
      });
      return route.fulfill({ json: { data: { incident: { incidentId: 'fallback-incident' } } } });
    }
    return route.fulfill({ json: { data: { incidents: [] } } });
  });

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Medical', exact: true }).click();
  await page.getByLabel('Description of Incident').fill('Patient needs urgent medical assistance');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Report Emergency', exact: true })).toHaveCount(0);
  expect(fallbackUploads).toBe(1);
  expect(incidentCreated).toBe(true);
});

test('blocked direct upload of a large photo preserves the draft without sending an oversized fallback', async ({ page }) => {
  await session(page, 'USER');
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }));
  await page.route('**/api/upload/v1/signature', route => route.fulfill({
    json: { data: { cloudName: 'test', apiKey: 'test', timestamp: 1, folder: 'evidence/test-user', publicId: 'photo', allowed_formats: 'jpg,jpeg,png,webp,heic', signature: 'test', type: 'authenticated' } },
  }));
  await page.route('https://api.cloudinary.com/**', route => route.abort('failed'));
  let fallbacks = 0;
  let creations = 0;
  await page.route('**/api/upload/v1/image', route => { fallbacks++; return route.fulfill({ status: 413 }); });
  await page.route('**/api/incidents/v1/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/nearby-check')) return route.fulfill({ json: { data: { duplicate: false } } });
    if (route.request().method() === 'POST') creations++;
    return route.fulfill({ json: { data: { incidents: [] } } });
  });
  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await page.getByLabel('Description of Incident').fill('Clearly labeled synthetic upload-boundary test');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  const photo = Buffer.alloc(4 * 1024 * 1024);
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64').copy(photo);
  await page.locator('input[type="file"]').setInputFiles({ name: 'large-proof.png', mimeType: 'image/png', buffer: photo });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText('choose a photo under 2.5 MB', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Description of Incident')).toHaveValue('Clearly labeled synthetic upload-boundary test');
  await expect(page.getByRole('button', { name: 'Submit Report', exact: true })).toBeEnabled();
  expect(fallbacks).toBe(0);
  expect(creations).toBe(0);
});

test('citizen daily-limit response stays in the form without a development error overlay', async ({ page }) => {
  await session(page, 'USER');
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route('https://nominatim.openstreetmap.org/**', route =>
    route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }),
  );
  await page.route('**/api/upload/v1/signature', route =>
    route.fulfill({ json: { data: { cloudName: 'test', apiKey: 'test', timestamp: 1, folder: 'evidence/test-user', publicId: 'photo', allowed_formats: 'jpg,jpeg,png,webp,heic', signature: 'test', type: 'authenticated' } } }),
  );
  await page.route('https://api.cloudinary.com/**', route =>
    route.fulfill({ json: { public_id: 'evidence/test-user/conflict', secure_url: 'https://example.test/conflict.png', format: 'png', bytes: 68, width: 1, height: 1 } }),
  );
  await page.route('**/api/incidents/v1/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/nearby-check')) {
      return route.fulfill({ json: { data: { duplicate: false } } });
    }
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 429,
        json: { status: 'error', message: 'You have reached the daily limit of 2 emergency reports. You can submit again after midnight (Asia/Manila).' },
      });
    }
    return route.fulfill({ json: { data: { incidents: [] } } });
  });

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await page.getByLabel('Description of Incident').fill('Smoke coming from a building');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();

  await expect(page.getByText('You have reached the daily limit of 2 emergency reports.', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Description of Incident')).toHaveValue('Smoke coming from a building');
  expect(consoleErrors.some(message => message.includes('Incident report error:'))).toBe(false);
});

test('nearby active incident is detected before uploading evidence', async ({ page }) => {
  await session(page, 'USER');
  let uploadRequests = 0;
  await page.route('https://nominatim.openstreetmap.org/**', route =>
    route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }),
  );
  await page.route('**/api/upload/v1/signature', route => {
    uploadRequests += 1;
    return route.fulfill({ json: { data: {} } });
  });
  await page.route('**/api/incidents/v1/nearby-check', route => route.fulfill({
    json: {
      data: {
        duplicate: true,
        message: 'A similar active emergency has already been reported nearby. Your report was not submitted.',
      },
    },
  }));

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await page.getByLabel('Description of Incident').fill('Smoke coming from the same building');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();

  await expect(page.getByRole('dialog', { name: 'Report Emergency' }).getByRole('alert')).toContainText('A similar active emergency has already been reported nearby.');
  await expect(page.getByRole('dialog', { name: 'Report Emergency' }).getByRole('alert').getByRole('link', { name: /Call 911/i })).toBeVisible();
  await expect(page.getByLabel('Description of Incident')).toHaveValue('Smoke coming from the same building');
  expect(uploadRequests).toBe(0);
});

test('create-time duplicate race retains the form and gives a safe warning', async ({ page }) => {
  await session(page, 'USER');
  let createRequests = 0;
  await page.route('https://nominatim.openstreetmap.org/**', route =>
    route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }),
  );
  await page.route('**/api/upload/v1/signature', route => route.fulfill({
    json: { data: { cloudName: 'test', apiKey: 'test', timestamp: 1, folder: 'evidence/test-user', publicId: 'photo', allowed_formats: 'jpg,jpeg,png,webp,heic', signature: 'test', type: 'authenticated' } },
  }));
  await page.route('https://api.cloudinary.com/**', route => route.fulfill({
    json: { public_id: 'evidence/test-user/race', secure_url: 'https://example.test/race.png', format: 'png', bytes: 68, width: 1, height: 1 },
  }));
  await page.route('**/api/incidents/v1/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/nearby-check')) {
      return route.fulfill({ json: { data: { duplicate: false } } });
    }
    if (route.request().method() === 'POST') {
      createRequests += 1;
      return route.fulfill({
        status: 409,
        json: {
          status: 'error',
          errorCode: 'DUPLICATE_ACTIVE_INCIDENT',
          message: 'A similar active emergency has already been reported nearby. Your report was not submitted.',
        },
      });
    }
    return route.fulfill({ json: { data: { incidents: [] } } });
  });

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await page.getByLabel('Description of Incident').fill('Smoke coming from the same building');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();

  await expect(page.getByRole('dialog', { name: 'Report Emergency' }).getByRole('alert')).toContainText('Your report was not submitted.');
  await expect(page.getByRole('dialog', { name: 'Report Emergency' }).getByRole('alert').getByRole('link', { name: /Call 911/i })).toBeVisible();
  await expect(page.getByLabel('Description of Incident')).toHaveValue('Smoke coming from the same building');
  await expect(page.getByLabel('Contact Number')).toHaveValue('09171234567');
  expect(createRequests).toBe(1);
});

test('Other emergency can request Medical and Hazard in one report', async ({ page }) => {
  await session(page, 'USER');
  let createdPayload: Record<string, unknown> | undefined;
  await page.route('https://nominatim.openstreetmap.org/**', route =>
    route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }),
  );
  await page.route('**/api/upload/v1/signature', route => route.fulfill({
    json: { data: { cloudName: 'test', apiKey: 'test', timestamp: 1, folder: 'evidence/test-user', publicId: 'photo', allowed_formats: 'jpg,jpeg,png,webp,heic', signature: 'test', type: 'authenticated' } },
  }));
  await page.route('https://api.cloudinary.com/**', route => route.fulfill({
    json: { public_id: 'evidence/test-user/storm', secure_url: 'https://example.test/storm.png', format: 'png', bytes: 68, width: 1, height: 1 },
  }));
  await page.route('**/api/incidents/v1/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/nearby-check')) {
      expect(route.request().postDataJSON().requestedServices).toEqual(['MEDICAL', 'HAZARD']);
      return route.fulfill({ json: { data: { duplicate: false } } });
    }
    if (route.request().method() === 'POST') {
      createdPayload = route.request().postDataJSON();
      return route.fulfill({ json: { data: { incident: { incidentId: 'storm-incident' } } } });
    }
    return route.fulfill({ json: { data: { incidents: [] } } });
  });

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await page.getByText('Other', { exact: true }).click();
  await expect(page.getByText(/Response services needed/)).toBeVisible();
  await page.getByLabel('Medical / EMS response').check();
  await page.getByLabel('Description of Incident').fill('Storm flooding with injured residents');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'storm.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText('Select at least two response services needed for this emergency')).toBeVisible();

  await page.getByLabel('Hazard / DRRMO response').check();
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Report Emergency', exact: true })).toHaveCount(0);
  expect(createdPayload).toMatchObject({
    category: 'other',
    requestedServices: ['MEDICAL', 'HAZARD'],
  });
});

test('multi-response incident appears only on selected department dashboards', async ({ page }) => {
  await session(page, 'ADMIN');
  const incident = {
    incidentId: 'storm-incident',
    title: 'Storm with injured residents',
    description: 'Flooding and injuries',
    typeId: 'general-type',
    locationId: 'location',
    barangayId: 'barangay',
    latitude: 10.251,
    longitude: 123.949,
    severityLevel: 'HIGH',
    status: 'RESPONDING',
    verificationStatus: 'VERIFIED',
    requestedServices: ['MEDICAL', 'HAZARD'],
    reportedBy: 'citizen',
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'general-type', typeName: 'General Emergency' },
    location: { locationId: 'location', locationName: 'Poblacion' },
    attachments: [],
  };
  await page.route('**/api/incidents/v1/**', route => route.fulfill({
    json: { data: { incidents: [incident] } },
  }));

  await page.goto('/admin/medical-dashboard');
  await page.getByRole('button', { name: 'Responding (1)' }).click();
  await expect(page.getByText('Storm with injured residents')).toBeVisible();
  await page.goto('/admin/drrmo-dashboard');
  await page.getByRole('button', { name: 'Responding (1)' }).click();
  await expect(page.getByText('Storm with injured residents')).toBeVisible();
  await page.goto('/admin/fire-dashboard');
  await expect(page.getByText('Storm with injured residents')).toHaveCount(0);
});

test('fire dashboard uses incident-list unit data without a request per report', async ({ page }) => {
  await session(page, 'ADMIN');
  let unitRequests = 0;
  const incidents = Array.from({ length: 3 }, (_, index) => ({
    incidentId: `fire-${index}`,
    title: `Fire response ${index}`,
    description: 'Dispatch list performance check',
    typeId: 'fire-type',
    locationId: 'location',
    severityLevel: 'HIGH',
    status: 'RESPONDING',
    verificationStatus: 'VERIFIED',
    requestedServices: ['FIRE'],
    reportedBy: 'citizen',
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'fire-type', typeName: 'Fire' },
    location: { locationId: 'location', locationName: 'Poblacion' },
    incidentUnits: [],
    attachments: [],
  }));
  await page.route('**/api/incidents/v1/**', route => {
    if (/\/units(?:\?|$)/.test(new URL(route.request().url()).pathname)) unitRequests += 1;
    return route.fulfill({ json: { data: { incidents } } });
  });

  await page.goto('/admin/fire-dashboard');
  await page.getByRole('button', { name: 'Responding (3)' }).click();
  await expect(page.getByText('Fire response 0')).toBeVisible();
  await expect(page.getByText('Fire response 1')).toBeVisible();
  await expect(page.getByText('Fire response 2')).toBeVisible();
  expect(unitRequests).toBe(0);
});

test('protected evidence is resolved through an authorized short-lived URL', async ({ page }) => {
  await session(page, 'ADMIN');
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=';
  let accessRequests = 0;
  const incident = {
    incidentId: 'incident-with-evidence',
    title: 'Incident with protected evidence',
    description: 'Evidence viewer test',
    typeId: 'fire-type',
    locationId: 'location',
    severityLevel: 'HIGH',
    status: 'RESOLVED',
    verificationStatus: 'VERIFIED',
    requestedServices: ['FIRE'],
    reportedBy: 'citizen',
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'fire-type', typeName: 'Fire' },
    location: { locationId: 'location', locationName: 'Poblacion' },
    attachments: [{
      attachmentId: 'protected-photo',
      fileName: 'evidence.png',
      fileType: 'image/png',
      fileUrl: 'http://localhost:8000/api/attachments/v1/protected-photo/content',
      uploadedAt: new Date().toISOString(),
    }],
  };

  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [incident] } } }));
  await page.route('**/api/attachments/v1/protected-photo/access-url', route => {
    accessRequests += 1;
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers()['x-auth-scope']).toBeUndefined();
    return route.fulfill({ json: { data: { url: pixel, expiresInSeconds: 60 } } });
  });

  await page.goto('/admin/main-dashboard');
  const evidence = page.getByAltText('Incident Photo Evidence');
  await expect(evidence).toBeVisible();
  await expect(evidence).toHaveAttribute('src', pixel);
  // The thumbnail may stay visible past the storage URL's 60-second expiry.
  // Opening it must go back through the authorized endpoint for a fresh URL.
  await expect(page.getByRole('link', { name: 'View photo →' })).toHaveAttribute(
    'href',
    'http://localhost:8000/api/attachments/v1/protected-photo/content',
  );
  await expect(page.getByRole('link', { name: 'Incident Photo Evidence' })).toHaveAttribute(
    'href',
    'http://localhost:8000/api/attachments/v1/protected-photo/content',
  );
  expect(accessRequests).toBe(1);
});

test('missing stored evidence shows an honest retry state instead of a broken photo link', async ({ page }) => {
  await session(page, 'ADMIN');
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=';
  const incident = {
    incidentId: 'incident-with-missing-evidence',
    title: 'Incident with missing evidence',
    description: 'Evidence unavailable test',
    typeId: 'fire-type',
    locationId: 'location',
    severityLevel: 'HIGH',
    status: 'RESOLVED',
    verificationStatus: 'VERIFIED',
    requestedServices: ['FIRE'],
    reportedBy: 'citizen',
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'fire-type', typeName: 'Fire' },
    location: { locationId: 'location', locationName: 'Poblacion' },
    attachments: [{
      attachmentId: 'missing-photo',
      fileName: 'evidence.png',
      fileType: 'image/png',
      fileUrl: 'http://localhost:8000/api/attachments/v1/missing-photo/content',
      uploadedAt: new Date().toISOString(),
    }],
  };
  let accessRequests = 0;

  await page.route('**/api/incidents/v1/**', route => route.fulfill({ json: { data: { incidents: [incident] } } }));
  await page.route('**/api/attachments/v1/missing-photo/access-url', route => {
    accessRequests += 1;
    return route.fulfill({ json: { data: { url: accessRequests === 1 ? 'https://res.cloudinary.com/test/image/authenticated/missing.png' : pixel, expiresInSeconds: 60 } } });
  });
  await page.route('https://res.cloudinary.com/test/image/authenticated/missing.png', route => route.fulfill({ status: 404, body: 'Resource not found' }));

  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Photo image unavailable')).toBeVisible();
  await expect(page.getByText('The image could not be loaded. Report details remain available.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View photo →' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Retry photo' }).click();
  await expect(page.getByRole('link', { name: 'View photo →' })).toBeVisible();
  expect(accessRequests).toBe(2);
});

test('citizen dashboard allows a second report and disables a third until the next Manila day', async ({ page }) => {
  await session(page, 'USER');
  const makeIncident = (id: string, title: string) => ({
    incidentId: id,
    title,
    description: '',
    typeId: 'type',
    locationId: 'location',
    severityLevel: 'HIGH',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    reportedBy: 'test-user',
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'type', typeName: 'Fire' },
    location: { locationId: 'location', locationName: 'Poblacion' },
    attachments: [],
  });
  let incidents = [makeIncident('first', 'First emergency')];

  await page.route('**/api/incidents/v1/**', route =>
    route.fulfill({ json: { data: { incidents } } }),
  );

  await page.goto('/dashboard');
  const help = page.getByRole('complementary', { name: 'Help and status' });
  await expect(help.getByText('1 emergency report remaining today', { exact: true })).toBeVisible();
  await expect(help.getByText('1/2 Today', { exact: true })).toBeVisible();

  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report Emergency', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  incidents = [...incidents, makeIncident('second', 'Second emergency')];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(help.getByText('Daily report limit reached', { exact: true })).toBeVisible();
  await expect(help.getByText('2/2 Today', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Fire', exact: true }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Report Emergency', exact: true })).toHaveCount(0);
});

test('one citizen submission becomes visible to main admin without a list-request storm', async ({ page }) => {
  await session(page, 'USER');
  let actingAsAdmin = false;
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: actingAsAdmin
      ? { id: 'test-admin', name: 'Test Admin', email: 'admin@example.test', role: 'ADMIN', department: 'MAIN', isMainAdmin: true, permissions: ['incident:manage-all'] }
      : { id: 'test-user', name: 'Test User', email: 'user@example.test', role: 'USER', permissions: ['incident:create-own'] } } },
  }));
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: { address: { town: 'Cordova', province: 'Cebu' } } }));
  await page.route('**/api/upload/v1/signature', route => route.fulfill({
    json: { data: { cloudName: 'test', apiKey: 'test', timestamp: 1, folder: 'evidence/test-user', publicId: 'photo', allowed_formats: 'jpg,jpeg,png,webp,heic', signature: 'test', type: 'authenticated' } },
  }));
  await page.route('https://api.cloudinary.com/**', route => route.fulfill({
    json: { public_id: 'evidence/test-user/flow-proof', secure_url: 'https://example.test/flow-proof.png', format: 'png', bytes: 68, width: 1, height: 1 },
  }));

  let created = false;
  let submissions = 0;
  let adminListRequests = 0;
  const incident = {
    incidentId: 'citizen-to-admin', title: 'Simulated citizen fire report', description: 'Smoke near a building',
    status: 'RESPONDING', verificationStatus: 'VERIFIED', reportedBy: 'test-user',
    reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    type: { typeId: 'fire', typeName: 'Fire' }, location: { locationId: 'loc', locationName: 'Poblacion' },
    reporter: { id: 'test-user', name: 'Test User' }, attachments: [], serviceResponses: [],
  };
  await page.route('**/api/incidents/v1/**', route => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/nearby-check')) {
      return route.fulfill({ json: { data: { duplicate: false } } });
    }
    if (request.method() === 'POST') {
      submissions += 1;
      expect(request.postDataJSON().proofAttachment?.publicId).toBe('evidence/test-user/flow-proof');
      created = true;
      return route.fulfill({ status: 201, json: { data: { incident } } });
    }
    if (new URL(request.url()).pathname.endsWith('/review-flags')) return route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
    if (!new URL(request.url()).searchParams.has('reportedBy')) adminListRequests += 1;
    return route.fulfill({ json: { data: { incidents: created ? [incident] : [] } } });
  });

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Fire', exact: true }).click();
  await page.getByLabel('Description of Incident').fill('Smoke near a building');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await confirmEmergencyMapPin(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'proof.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report Emergency', exact: true })).toHaveCount(0);
  expect(submissions).toBe(1);

  actingAsAdmin = true;
  await page.evaluate(() => localStorage.setItem('user', JSON.stringify({ id: 'test-admin', name: 'Test Admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true })));
  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Simulated citizen fire report')).toBeVisible();
  expect(adminListRequests).toBeGreaterThan(0);
  expect(adminListRequests).toBeLessThanOrEqual(2);
});
