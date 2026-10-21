import apiClient, { API_ORIGIN } from '@/lib/apiClient';
import type { DeviceFix } from '@/lib/deviceLocation';
import { PRESENCE_SHARING, validatePresenceSnapshot } from '@/lib/citizenPresenceLocations';

export const citizenPresenceUiEnabled = process.env.NEXT_PUBLIC_CITIZEN_PRESENCE_ENABLED === 'true';
export async function presenceCapability(signal: AbortSignal) {
  const response = await apiClient.get('/citizen-presence/v2/capability', { signal });
  return response.data?.data?.enabled === true && response.data?.data?.precision === PRESENCE_SHARING;
}
export async function refreshPresence(visitId: string, fix: DeviceFix | null, signal: AbortSignal) {
  const response = fix
    ? await apiClient.post('/citizen-presence/v2/heartbeat', { visitId, sharing: PRESENCE_SHARING, ...fix }, { signal })
    : await apiClient.post('/citizen-presence/v2/nearby', { visitId, sharing: PRESENCE_SHARING }, { signal });
  return validatePresenceSnapshot(response.data?.data);
}
export function leavePresence(visitId: string) {
  // pagehide cannot wait for Axios/session renewal. Existing HttpOnly cookies,
  // gateway/origin/session guards still own this best-effort same API request.
  void fetch(`${API_ORIGIN}/api/citizen-presence/v2/leave`, { method: 'POST', credentials: 'include', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitId, sharing: PRESENCE_SHARING }) }).catch(() => {});
}
