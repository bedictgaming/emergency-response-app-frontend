'use client';

import { useEffect } from 'react';
import { registerWebPushOnAdminVisit } from '@/lib/browserPush';

/** Background setup only. Permission and delivery remain browser-controlled. */
export default function AdminPushNotifications() {
  useEffect(() => {
    let active = true, pending = false, registered = false, warned = false;
    // The shared header mounts only after the current admin is server-verified.
    // Keep registration independent of visible controls or an open dashboard.
    const initialize = () => {
      if (!active || pending || registered || document.visibilityState !== 'visible' || !navigator.onLine) return;
      pending = true;
      void registerWebPushOnAdminVisit()
        .then(value => { registered = value; })
        .catch(() => {
          if (active && !warned) {
            warned = true;
            // Never log provider errors, endpoints, credentials or report data.
            console.warn('Background notifications could not register. Check browser site permissions and keep the dashboard open.');
          }
        })
        .finally(() => { pending = false; });
    };
    document.addEventListener('visibilitychange', initialize);
    window.addEventListener('online', initialize);
    initialize();
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', initialize);
      window.removeEventListener('online', initialize);
      // Closing a page must not unsubscribe the device or unregister its worker.
      // Only the existing explicit logout flow performs account-bound cleanup.
    };
  }, []);

  return null;
}
