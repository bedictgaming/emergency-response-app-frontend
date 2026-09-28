'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // A service worker installed by a local production preview otherwise
      // keeps controlling `next dev` and can serve stale hashed CSS/JS.
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys
            .filter(key => key.startsWith('emergency-response-shell-'))
            .map(key => caches.delete(key)));
        }
      })();
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await registration.update();
      } catch (error) {
        console.warn('Offline cache registration failed', error);
      }
    };
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
