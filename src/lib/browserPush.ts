import axios from 'axios';
import apiClient, { API_ORIGIN } from '@/lib/apiClient';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';

type PushConfig = { enabled: boolean; publicKey: string | null; reason?: string | null };
export type PushProblem = 'unsupported' | 'insecure' | 'local-disabled' | 'not-configured' | 'worker-disabled' | 'worker-unavailable' | 'session-changed';
export class WebPushError extends Error {
  constructor(public readonly problem: PushProblem) { super(problem); this.name = 'WebPushError'; }
}

let pushConfigRequest: Promise<PushConfig> | undefined;
const registrationRequests = new Map<string, Promise<boolean>>();
const automaticPromptKey = 'emergency-admin-push-prompt-v1';
let automaticPromptAttempted = false;

export function webPushProblem(): PushProblem | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'true'
    || (process.env.NODE_ENV !== 'production' && (process.env.NEXT_PUBLIC_ENABLE_DEV_PUSH !== 'true'
      || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)))) return 'local-disabled';
  return null;
}

function identity() { return `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}`; }
function assertIdentity(expected: string) { if (identity() !== expected) throw new WebPushError('session-changed'); }

async function readyWorker(): Promise<ServiceWorkerRegistration> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new WebPushError('worker-unavailable')), 8000); }),
    ]);
  } finally { clearTimeout(timeout); }
}

function loadPushConfig(): Promise<PushConfig> {
  pushConfigRequest ??= axios
    .get<{ data: PushConfig }>(`${API_ORIGIN}/api/notifications/v1/web-push-key`, { timeout: 15_000 })
    .then(response => response.data.data)
    .finally(() => { pushConfigRequest = undefined; });
  return pushConfigRequest;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, character => character.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function performWebPushRegistration(
  permissionRequest: Promise<NotificationPermission>,
  expectedIdentity: string,
): Promise<boolean> {
  const permission = await permissionRequest;
  assertIdentity(expectedIdentity);
  if (permission !== 'granted') return false;
  const config = await loadPushConfig();
  assertIdentity(expectedIdentity);
  if (!config.enabled || !config.publicKey) throw new WebPushError(config.reason === 'worker-disabled' ? 'worker-disabled' : 'not-configured');

  const registration = await readyWorker();
  assertIdentity(expectedIdentity);
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(config.publicKey),
    });
  }
  assertIdentity(expectedIdentity);
  await apiClient.post('/notifications/v1/device-token', {
    token: JSON.stringify(subscription.toJSON()), platform: 'web',
  });
  assertIdentity(expectedIdentity);
  return true;
}

export function registerWebPush(requestPermission = false): Promise<boolean> {
  if (webPushProblem()) return Promise.resolve(false);

  const permission = Notification.permission;
  // Silent checks must not call the backend or prompt before browser consent.
  if (!requestPermission && permission !== 'granted') return Promise.resolve(false);

  const expectedIdentity = identity();
  const key = expectedIdentity;
  const existing = registrationRequests.get(key);
  if (existing) return existing;
  // Explicit retries retain the click's activation. An automatic first-visit
  // attempt may be refused by the browser; refusal must leave a manual fallback,
  // never pretend consent or mask errors from the subsequent registration API.
  let permissionRequest = Promise.resolve(permission);
  if (permission === 'default' && requestPermission) {
    try {
      permissionRequest = Notification.requestPermission().catch(() => 'default' as const);
    } catch {
      return Promise.resolve(false);
    }
  }
  const pending = performWebPushRegistration(permissionRequest, expectedIdentity)
    .finally(() => { if (registrationRequests.get(key) === pending) registrationRequests.delete(key); });
  registrationRequests.set(key, pending);
  return pending;
}

/** Call only from the server-verified admin surface, never public/login pages. */
export function registerWebPushOnAdminVisit(): Promise<boolean> {
  if (webPushProblem() || document.visibilityState !== 'visible') return Promise.resolve(false);
  if (Notification.permission !== 'default') return registerWebPush();
  // Browser permission is origin-wide. Keep only a non-private attempted marker
  // so dismissals, remounts, reloads and account switches do not nag the user.
  // If persistence is unavailable, fail closed to the explicit Enable button.
  try {
    if (automaticPromptAttempted || localStorage.getItem(automaticPromptKey)) return Promise.resolve(false);
    localStorage.setItem(automaticPromptKey, 'attempted');
    automaticPromptAttempted = true;
  } catch {
    return Promise.resolve(false);
  }
  return registerWebPush(true);
}

/** Device display only: not a provider-send or closed-tab delivery proof. */
export async function showWebPushDeviceTest(): Promise<void> {
  if (webPushProblem() || Notification.permission !== 'granted') throw new WebPushError('unsupported');
  const registration = await readyWorker();
  await registration.showNotification('Emergency Response — device test', {
    body: 'Local display test only. This does not verify server push delivery.',
    icon: '/icons/icon-192.png', tag: 'emergency-device-test', data: { url: window.location.pathname },
  });
}

export async function unregisterWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  // `serviceWorker.ready` never resolves when no active worker controls this
  // page. Logout must not be held hostage by optional push cleanup.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await apiClient.delete('/notifications/v1/device-token', {
    data: { token: JSON.stringify(subscription.toJSON()) },
  });
}
