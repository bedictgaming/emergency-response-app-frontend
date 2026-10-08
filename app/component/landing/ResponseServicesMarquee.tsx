'use client';

import { useEffect, useRef, useState } from 'react';
import { Flame, HeartPulse, Radio, ShieldAlert } from 'lucide-react';
import { useLandingReducedMotion } from './useLandingReducedMotion';
import styles from './landing-motion.module.css';

// Service symbols, not official agency logos or customer endorsements.
const services = [
  { name: 'Fire', Icon: Flame, tone: styles.serviceFire },
  { name: 'Medical', Icon: HeartPulse, tone: styles.serviceMedical },
  { name: 'Police', Icon: ShieldAlert, tone: styles.servicePolice },
  { name: 'DRRMO', Icon: Radio, tone: styles.serviceDrrmo },
];

export function ResponseServicesMarquee() {
  const ref = useRef<HTMLElement>(null);
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const reducedMotion = useLandingReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    setMotionAvailable(true);
    const observer = new IntersectionObserver(entries => {
      setInView(entries[0]?.isIntersecting ?? false);
    }, { threshold: 0 });
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
    <section
      ref={ref}
      aria-label="Response services"
      className={styles.serviceMarquee}
      data-motion={motionAvailable && !reducedMotion}
      data-running={motionAvailable && !reducedMotion && inView && documentVisible}
    >
      <div className={styles.serviceWindow}>
        <div className={styles.serviceTrack} data-testid="service-marquee-track">
          {[false, true].map(duplicate => (
            <ul
              key={String(duplicate)}
              className={`${styles.serviceGroup} ${duplicate ? styles.serviceDuplicate : ''}`}
              aria-hidden={duplicate ? true : undefined}
            >
              {services.map(({ name, Icon, tone }) => (
                <li key={name} className={styles.serviceItem}>
                  <Icon className={tone} size={28} strokeWidth={2} aria-hidden="true" />
                  <span>{name}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
