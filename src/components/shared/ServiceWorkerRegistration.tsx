'use client';

import { useEffect } from 'react';
import { API_ORIGIN } from '@/lib/apiClient';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const devPush = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_DEV_PUSH === 'true'
      && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if ((!devPush && process.env.NODE_ENV !== 'production') || process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'true') {
      // A service worker installed by a local production preview otherwise
      // keeps controlling `next dev` and can serve stale hashed CSS/JS.
      // Protected Vercel validation also disables PWA installability because
      // Vercel Authentication redirects the manifest to a cross-origin SSO URL.
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
        // Explicit local push testing never enables dev asset/offline caching.
        const workerUrl = devPush ? `/sw.js?pushOnly=1&apiOrigin=${encodeURIComponent(API_ORIGIN)}` : '/sw.js';
        const registration = await navigator.serviceWorker.register(workerUrl, { scope: '/', updateViaCache: 'none' });
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
