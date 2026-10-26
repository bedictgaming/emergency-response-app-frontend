// A versioned choice only: never GPS, peer data, tokens or server authority.
// Older per-tab/approximate consent cannot enable automatic exact-GPS sharing.
export const PRESENCE_PREFERENCE_EVENT = 'citizen-presence-preference-changed';
export const PRESENCE_PREFERENCE_VERSION = 'automatic-visible-exact-gps-v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PresencePreference = { enabled: boolean; error: 'load' | 'start' | 'stop' | null };

export function presencePreferenceKey(userId: string | undefined): string | null {
  if (!userId || userId.length > 128) return null;
  try { return `citizen-presence:${PRESENCE_PREFERENCE_VERSION}:${encodeURIComponent(userId)}`; }
  catch { return null; }
}

export function loadPresencePreference(userId: string | undefined, storage?: PreferenceStorage): PresencePreference {
  const key = presencePreferenceKey(userId);
  if (!key) return { enabled: false, error: null };
  try {
    const store = storage ?? window.localStorage;
    if (store.getItem(key) !== 'on') return { enabled: false, error: null };
    // Do not auto-resume from a read-only store that cannot save Stop sharing.
    // A separate probe never rewrites a concurrent OFF choice in another tab.
    const probe = `${key}:storage-check`;
    store.setItem(probe, '1'); store.removeItem(probe);
    return { enabled: store.getItem(key) === 'on', error: null };
  } catch { return { enabled: false, error: 'load' }; }
}

export function savePresencePreference(userId: string | undefined, enabled: boolean, storage?: PreferenceStorage): PresencePreference {
  const key = presencePreferenceKey(userId);
  if (!key) return { enabled: false, error: enabled ? 'start' : 'stop' };
  try {
    const store = storage ?? window.localStorage, value = enabled ? 'on' : 'off';
    store.setItem(key, value);
    if (store.getItem(key) !== value) throw new Error('Preference not saved');
    return { enabled, error: null };
  } catch {
    // Removing the ON record also saves OFF when quota prevents a write.
    if (!enabled) try {
      const store = storage ?? window.localStorage;
      store.removeItem(key);
      if (store.getItem(key) !== 'on') return { enabled: false, error: null };
    } catch { /* Stop locally and explain the unsaved choice below. */ }
    return { enabled: false, error: enabled ? 'start' : 'stop' };
  }
}
