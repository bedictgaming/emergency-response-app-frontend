const CACHE = 'emergency-response-shell-v4';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('emergency-response-shell-') && key !== CACHE)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Authentication and emergency data must always come from the network and
  // must never be written to a shared browser cache.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  const isImmutableAsset = url.pathname.startsWith('/_next/static/')
    || /\.(?:css|js|woff2?|png|svg|ico)$/i.test(url.pathname);
  if (!isImmutableAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Store only opaque notification IDs/expiry, never private report payloads.
function notificationStore(mode, action) {
  return new Promise((resolve, reject) => {
    let db, settled = false;
    const finish = (value, failed = false) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); db?.close();
      if (failed) reject(new Error('Receipt storage unavailable')); else resolve(value);
    };
    const timeout = setTimeout(() => finish(undefined, true), 3000);
    const request = indexedDB.open('emergency-notification-receipts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('receipts');
    request.onerror = request.onblocked = () => finish(undefined, true);
    request.onsuccess = () => {
      db = request.result;
      if (settled) { db.close(); return; }
      try {
        const tx = db.transaction('receipts', mode);
        let result;
        action(tx.objectStore('receipts'), value => { result = value; });
        tx.oncomplete = () => finish(result);
        tx.onerror = tx.onabort = () => finish(undefined, true);
      } catch { finish(undefined, true); }
    };
  });
}
async function alreadyShown(id) {
  return notificationStore('readonly', (store, set) => {
    const request = store.get(id); request.onsuccess = () => set(request.result > Date.now());
  }).catch(() => false);
}
async function recordShown(id, expires) {
  return notificationStore('readwrite', store => {
    store.put(expires, id);
    const request = store.openCursor();
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (cursor.value <= Date.now()) cursor.delete(); cursor.continue(); };
  }).catch(() => {});
}
function safeTarget(value) {
  try { const url = new URL(value || '/dashboard', self.location.origin); return url.origin === self.location.origin && !url.username && !url.password ? url.href : `${self.location.origin}/dashboard`; }
  catch { return `${self.location.origin}/dashboard`; }
}
let pushWork = Promise.resolve();

self.addEventListener('push', (event) => {
  let payload = { title: 'Emergency response update', body: 'Open the app to view the update.', data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Keep the privacy-safe fallback for malformed messages.
  }
  pushWork = pushWork.catch(() => {}).then(async () => {
    const id = payload.data?.notificationId;
    const expiry = Date.parse(payload.data?.expiresAt);
    if (Number.isFinite(expiry) && expiry <= Date.now()) return;
    const validId = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
    if (validId && await alreadyShown(id)) return;
    let verified = false;
    if (validId) {
      try {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
        let response;
        try { response = await fetch(`/api/notifications/v1/${id}/relevance`, { credentials: 'include', cache: 'no-store', signal: controller.signal }); }
        finally { clearTimeout(timeout); }
        if (response.status === 404 || response.status === 403) return;
        if (response.ok) { const current = await response.json(); if (current.relevant === false) return; verified = current.relevant === true; }
      } catch { /* Keep a neutral hint when current state cannot be confirmed. */ }
    }
    const tag = validId ? `notification:${id}` : payload.data?.alertId ? `alert:${payload.data.alertId}` : payload.data?.taskId ? `task:${payload.data.taskId}` : payload.data?.incidentId ? `incident:${payload.data.incidentId}` : 'emergency-update';
    if (validId && (await self.registration.getNotifications({ tag })).length) { await recordShown(id, Number.isFinite(expiry) ? expiry : Date.now() + 86400000); return; }
    if (Number.isFinite(expiry) && expiry <= Date.now()) return;
    await self.registration.showNotification('Emergency response update', {
      body: verified ? 'Open the app and sign in to view your update.' : 'An update is waiting. Sign in to check its current status.',
      icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      data: { url: safeTarget(payload.data?.url) }, tag,
    });
    if (validId) await recordShown(id, Number.isFinite(expiry) ? expiry : Date.now() + 86400000);
  });
  event.waitUntil(pushWork);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data?.url);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
