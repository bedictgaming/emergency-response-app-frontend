'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './landing-motion.module.css';
import { useLandingReducedMotion } from './useLandingReducedMotion';

// Adapted from Shadcn Space Animated Text 10 (MIT), with full-contrast ink,
// wrapping, a looping sweep and transform-only bar travel. See notices.
export function TextScanner({ text, accent = false }: { text: string; accent?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const reducedMotion = useLandingReducedMotion();
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      setInView(entries[0]?.isIntersecting ?? false);
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const syncVisibility = () => setDocumentVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);
  return (
    <span
      ref={ref}
      className={`${styles.scanner} ${accent ? styles.scannerAccent : ''}`}
      data-scanning={inView && documentVisible && !reducedMotion}
    >
      {text}
      <span className={styles.scannerHighlight} aria-hidden="true">{text}</span>
      <span className={styles.scannerBar} aria-hidden="true" />
    </span>
  );
}
