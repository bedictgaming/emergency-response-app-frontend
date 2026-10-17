import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/browserPush.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function fixture(options = {}) {
  const calls = [], timers = new Set(); let account = 'admin-a', permission = options.permission ?? 'default';
  const storage = options.storage ?? new Map([['emergency-logout-epoch', 'epoch']]);
  const document = { visibilityState: options.hidden ? 'hidden' : 'visible' };
  const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/synthetic', keys: {} }) };
  const worker = { pushManager: {
    getSubscription: async () => options.existing ? subscription : null,
    subscribe: async () => { calls.push('subscribe'); options.onSubscribe?.(() => { account = 'admin-b'; }); return subscription; },
  }, showNotification: async () => { calls.push('display'); } };
  const browserNotification = {
    get permission() { return permission; },
    requestPermission() {
      calls.push('permission');
      if (options.throwPermission) throw Error('Synthetic user-gesture restriction');
      if (options.rejectPermission) return Promise.reject(Error('Synthetic user-gesture restriction'));
      permission = options.answer ?? 'granted'; return Promise.resolve(permission);
    },
  };
  const apiClient = { post: async () => { calls.push('post'); if (options.postFails) throw Error('Synthetic registration failed'); }, delete: async () => { calls.push('delete'); } };
  const axios = { get: async () => { calls.push('config'); return { data: { data: options.config ?? { enabled: true, publicKey: 'B'.repeat(87) } } }; } };
  const exports = {};
  const window = { isSecureContext: options.secure !== false, PushManager: class {}, Notification: browserNotification,
    atob: value => Buffer.from(value, 'base64').toString('binary'), location: { hostname: 'localhost', pathname: '/admin/fire-dashboard' } };
  if (options.unsupported) delete window.PushManager;
  runInNewContext(source, {
    exports, require: id => id === 'axios' ? axios : id === '@/lib/apiClient' ? { __esModule: true, default: apiClient, API_ORIGIN: 'http://localhost:8000' }
      : id === '@/lib/adminAccountSnapshot' ? { adminAccountSnapshot: () => account } : (() => { throw Error('Unexpected import'); })(),
    window, Notification: browserNotification,
    navigator: { serviceWorker: { ready: options.noWorker ? new Promise(() => {}) : Promise.resolve(worker), getRegistration: async () => worker } },
    document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => {
      if (options.storageFails) throw Error('Synthetic storage restriction');
      storage.set(key, value);
    } },
    process: { env: { NODE_ENV: options.development ? 'development' : 'production', NEXT_PUBLIC_ENABLE_DEV_PUSH: options.devPush ? 'true' : 'false' } },
    Uint8Array, setTimeout: callback => { timers.add(callback); return callback; }, clearTimeout: callback => timers.delete(callback),
  });
  return { api: exports, calls, storage, document, changeAccount: value => { account = value; }, expire: () => { for (const callback of timers) callback(); } };
}
test('silent checks never prompt, subscribe or fetch config before browser consent', async () => {
  const f = fixture(); assert.equal(await f.api.registerWebPush(), false); assert.deepEqual(f.calls, []);
});
test('permission is requested during the click before configuration network work', async () => {
  const f = fixture(); const pending = f.api.registerWebPush(true);
  assert.deepEqual(f.calls, ['permission']); assert.equal(await pending, true);
  assert.deepEqual(f.calls, ['permission', 'config', 'subscribe', 'post']);
});
test('denied permission cannot cause registration or configuration requests', async () => {
  const f = fixture({ answer: 'denied' }); assert.equal(await f.api.registerWebPush(true), false); assert.deepEqual(f.calls, ['permission']);
});
test('unsupported and insecure contexts fail without prompting', async () => {
  for (const options of [{ unsupported: true }, { secure: false }]) {
    const f = fixture(options); assert.ok(f.api.webPushProblem()); assert.equal(await f.api.registerWebPush(true), false); assert.deepEqual(f.calls, []);
  }
});
test('development requires explicit push-only opt-in', async () => {
  const f = fixture({ development: true }); assert.equal(f.api.webPushProblem(), 'local-disabled');
  assert.equal(await f.api.registerWebPush(true), false); assert.deepEqual(f.calls, []);
  assert.equal(fixture({ development: true, devPush: true }).api.webPushProblem(), null);
});
test('missing configuration and disabled workers never report registration success', async () => {
  for (const reason of ['not-configured', 'worker-disabled']) {
    const f = fixture({ permission: 'granted', config: { enabled: false, publicKey: null, reason } });
    await assert.rejects(f.api.registerWebPush(), error => error.problem === reason);
    assert.deepEqual(f.calls, ['config']);
  }
});
test('existing subscription is rebound through authenticated API without subscribing twice', async () => {
  const f = fixture({ permission: 'granted', existing: true });
  assert.equal(await f.api.registerWebPush(), true); assert.deepEqual(f.calls, ['config', 'post']);
});
test('concurrent registration for the same account coalesces', async () => {
  const f = fixture({ permission: 'granted' });
  assert.deepEqual(await Promise.all([f.api.registerWebPush(), f.api.registerWebPush()]), [true, true]);
  assert.equal(f.calls.filter(call => call === 'post').length, 1);
});
test('registration API failure does not become registered and can be retried', async () => {
  const f = fixture({ permission: 'granted', postFails: true });
  await assert.rejects(f.api.registerWebPush()); await assert.rejects(f.api.registerWebPush());
  assert.equal(f.calls.filter(call => call === 'post').length, 2);
});
test('an account switch during subscribe prevents the stale authenticated POST', async () => {
  const f = fixture({ permission: 'granted', onSubscribe: change => change() });
  await assert.rejects(f.api.registerWebPush(), error => error.problem === 'session-changed');
  assert.ok(!f.calls.includes('post'));
});
test('a missing service worker times out instead of hanging', async () => {
  const f = fixture({ permission: 'granted', noWorker: true }); const pending = f.api.registerWebPush();
  await new Promise(resolve => setImmediate(resolve)); f.expire();
  await assert.rejects(pending, error => error.problem === 'worker-unavailable'); assert.ok(!f.calls.includes('post'));
});
test('device display test does not call any registration/provider API', async () => {
  const f = fixture({ permission: 'granted' }); await f.api.showWebPushDeviceTest(); assert.deepEqual(f.calls, ['display']);
});

test('first visible admin visit automatically requests browser consent before any network work', async () => {
  const f = fixture(); const pending = f.api.registerWebPushOnAdminVisit();
  assert.deepEqual(f.calls, ['permission']); assert.equal(f.storage.get('emergency-admin-push-prompt-v1'), 'attempted');
  assert.equal(await pending, true); assert.deepEqual(f.calls, ['permission', 'config', 'subscribe', 'post']);
});
test('dismissed automatic permission is not retried on remount, account switch or reload', async () => {
  const f = fixture({ answer: 'default' }); assert.equal(await f.api.registerWebPushOnAdminVisit(), false);
  f.changeAccount('admin-b'); assert.equal(await f.api.registerWebPushOnAdminVisit(), false);
  assert.deepEqual(f.calls, ['permission']);
  const reloaded = fixture({ storage: f.storage });
  assert.equal(await reloaded.api.registerWebPushOnAdminVisit(), false); assert.deepEqual(reloaded.calls, []);
});
test('denying an automatic request never subscribes or contacts the registration backend', async () => {
  const f = fixture({ answer: 'denied' }); assert.equal(await f.api.registerWebPushOnAdminVisit(), false);
  assert.equal(await f.api.registerWebPushOnAdminVisit(), false); assert.deepEqual(f.calls, ['permission']);
});
test('an already denied browser is never automatically prompted', async () => {
  const f = fixture({ permission: 'denied' }); assert.equal(await f.api.registerWebPushOnAdminVisit(), false);
  assert.deepEqual(f.calls, []);
});
test('an already allowed browser registers without another prompt even with the attempted marker', async () => {
  const f = fixture({ permission: 'granted', storage: new Map([['emergency-admin-push-prompt-v1', 'attempted']]) });
  assert.equal(await f.api.registerWebPushOnAdminVisit(), true); assert.deepEqual(f.calls, ['config', 'subscribe', 'post']);
});
test('browser gesture rejection leaves manual retry available without an automatic prompt loop', async () => {
  for (const kind of ['throwPermission', 'rejectPermission']) {
    const options = { [kind]: true }; const f = fixture(options);
    assert.equal(await f.api.registerWebPushOnAdminVisit(), false);
    assert.equal(await f.api.registerWebPushOnAdminVisit(), false); assert.deepEqual(f.calls, ['permission']);
    options[kind] = false; assert.equal(await f.api.registerWebPush(true), true);
    assert.deepEqual(f.calls, ['permission', 'permission', 'config', 'subscribe', 'post']);
  }
});
test('hidden tabs defer automatic permission until visible', async () => {
  const f = fixture({ hidden: true }); assert.equal(await f.api.registerWebPushOnAdminVisit(), false);
  assert.deepEqual(f.calls, []); assert.equal(f.storage.has('emergency-admin-push-prompt-v1'), false);
  f.document.visibilityState = 'visible'; assert.equal(await f.api.registerWebPushOnAdminVisit(), true);
  assert.equal(f.calls.filter(call => call === 'permission').length, 1);
});
test('unsupported, insecure and ordinary development contexts never automatically prompt', async () => {
  for (const options of [{ unsupported: true }, { secure: false }, { development: true }]) {
    const f = fixture(options); assert.equal(await f.api.registerWebPushOnAdminVisit(), false); assert.deepEqual(f.calls, []);
    assert.equal(f.storage.has('emergency-admin-push-prompt-v1'), false);
  }
});
test('unavailable marker storage skips automatic prompting but preserves explicit opt-in', async () => {
  const f = fixture({ storageFails: true }); assert.equal(await f.api.registerWebPushOnAdminVisit(), false);
  assert.deepEqual(f.calls, []); assert.equal(await f.api.registerWebPush(true), true);
});
test('automatic and explicit checks for the same account share the pending registration', async () => {
  const f = fixture(); const automatic = f.api.registerWebPushOnAdminVisit(), explicit = f.api.registerWebPush(true);
  assert.deepEqual(await Promise.all([automatic, explicit]), [true, true]);
  assert.equal(f.calls.filter(call => call === 'permission').length, 1);
  assert.equal(f.calls.filter(call => call === 'post').length, 1);
});
test('automatic permission does not mask missing configuration or failed authenticated persistence', async () => {
  const unconfigured = fixture({ config: { enabled: false, publicKey: null, reason: 'worker-disabled' } });
  await assert.rejects(unconfigured.api.registerWebPushOnAdminVisit(), error => error.problem === 'worker-disabled');
  assert.deepEqual(unconfigured.calls, ['permission', 'config']);
  const rejected = fixture({ postFails: true }); await assert.rejects(rejected.api.registerWebPushOnAdminVisit());
  assert.deepEqual(rejected.calls, ['permission', 'config', 'subscribe', 'post']);
});
