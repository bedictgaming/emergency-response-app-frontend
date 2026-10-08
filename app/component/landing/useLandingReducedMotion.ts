'use client';

import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const serverSnapshot = () => true;
const snapshot = () => window.matchMedia(query).matches;
function subscribe(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

// Motion's installed hook caches its initial value and does not subscribe to
// preference changes. A static server snapshot also avoids hidden-attribute
// hydration drift, so the pause control cannot remain hidden on first load.
export function useLandingReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
