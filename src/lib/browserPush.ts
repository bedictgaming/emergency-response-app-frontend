import axios from 'axios';
import apiClient, { API_ORIGIN } from '@/lib/apiClient';

type PushConfig = { enabled: boolean; publicKey: string | null };

let pushConfigRequest: Promise<PushConfig> | undefined;
let registrationRequest: Promise<boolean> | undefined;

function loadPushConfig(): Promise<PushConfig> {
  pushConfigRequest ??= axios
    .get<{ data: PushConfig }>(`${API_ORIGIN}/api/notifications/v1/web-push-key`, { timeout: 15_000 })
    .then(response => response.data.data)
    .catch(error => {
      // Permit a later explicit attempt after a temporary network failure.
      pushConfigRequest = undefined;
      throw error;
    });
  return pushConfigRequest;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, character => character.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function performWebPushRegistration(
  requestPermission: boolean,
  initialPermission: NotificationPermission,
): Promise<boolean> {
  const config = await loadPushConfig();
  if (!config.enabled || !config.publicKey) return false;

  let permission = initialPermission;
  if (permission === 'default' && requestPermission) permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(config.publicKey),
    });
  }
  await apiClient.post('/notifications/v1/device-token', {
    token: JSON.stringify(subscription.toJSON()), platform: 'web',
  });
  return true;
}

export function registerWebPush(requestPermission = false): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return Promise.resolve(false);
  }

  const permission = Notification.permission;
  // Passive page mounts must not call the backend or show a prompt when the
  // citizen/admin has not opted into notifications.
  if (!requestPermission && permission !== 'granted') return Promise.resolve(false);

  if (registrationRequest) return registrationRequest;

  registrationRequest = performWebPushRegistration(requestPermission, permission)
    .finally(() => { registrationRequest = undefined; });
  return registrationRequest;
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
