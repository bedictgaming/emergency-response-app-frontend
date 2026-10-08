'use client';

import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import styles from './landing/landing-motion.module.css';
import { useLandingReducedMotion } from './landing/useLandingReducedMotion';

interface HeaderFrameProps {
  children: ReactNode;
  surfaceClassName: string;
  pinned?: boolean;
  wide?: boolean;
  scrollContainer?: RefObject<HTMLElement | null>;
}

// The shared frame owns appearance and scroll behavior, never session or alerts.
export function HeaderFrame({ children, surfaceClassName, pinned = false, wide = false, scrollContainer }: HeaderFrameProps) {
  const header = useRef<HTMLElement>(null);
  const previousY = useRef(0);
  const travel = useRef(0);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useLandingReducedMotion();
  const { scrollY } = useScroll({ container: scrollContainer });

  useMotionValueEvent(scrollY, 'change', latest => {
    const host = scrollContainer?.current;
    const maxScroll = host ? host.scrollHeight - host.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
    const y = Math.max(0, Math.min(latest, maxScroll));
    const delta = y - previousY.current;
    previousY.current = y;
    setScrolled(current => current === (y > 50) ? current : y > 50);
    if (pinned || y <= 24 || header.current?.contains(document.activeElement)) {
      travel.current = 0;
      setHidden(false);
      return;
    }
    if (!delta) return;
    travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
    if (travel.current >= 36 && y > 80) {
      setHidden(true);
      travel.current = 0;
    } else if (travel.current <= -8) {
      setHidden(false);
      travel.current = 0;
    }
  });

  return (
    <header
      ref={header}
      data-header-frame="shared"
      data-pinned={pinned}
      data-hidden={!pinned && hidden && !focused}
      style={{
        transform: !pinned && hidden && !focused ? 'translateY(calc(-100% - 8px))' : 'translateY(0)',
        transitionDuration: reducedMotion || focused ? '0ms' : undefined,
      }}
      onFocusCapture={() => { setFocused(true); setHidden(false); travel.current = 0; }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      className={`${styles.header} sticky top-0 ${pinned ? 'z-40' : 'z-50'} w-full px-2 sm:px-4`}
    >
      <div className={`${styles.headerSurface} ${pinned ? styles.pinnedSurface : ''} ${scrolled ? styles.headerScrolled : ''} mx-auto ${wide ? 'max-w-[1600px]' : 'max-w-7xl'} ${surfaceClassName}`}>
        {children}
      </div>
    </header>
  );
}
