// A UI preference only: never grants permission or claims that browser audio is ready.
const PREFIX = 'emergency-admin-sound-v1:';

export function readAdminSoundPreference(account: string | null): boolean {
  if (!account || typeof window === 'undefined') return false;
  try { return localStorage.getItem(`${PREFIX}${account}`) === 'enabled'; }
  catch { return false; }
}

export function saveAdminSoundPreference(account: string | null): boolean {
  if (!account || typeof window === 'undefined') return false;
  try {
    localStorage.setItem(`${PREFIX}${account}`, 'enabled');
    return true;
  } catch { return false; }
}
