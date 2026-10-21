'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** Controlled expansion adapted from the owner's expanded-map reference.
 * Keep the real Leaflet viewport mounted; no static tile grid, preload, tilt
 * or click-to-toggle surface that could intercept report/map interactions. */
export function ExpandedMap({ expanded, compactHeight = 260, expandedHeight = 420, children }: {
  expanded: boolean;
  compactHeight?: number | string;
  expandedHeight?: number | string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const height = expanded ? expandedHeight : compactHeight;
  // Fluid full-map dialogs already have their own responsive size. Animate
  // only the bounded numeric inline viewport, never scale GPS geometry/text.
  const numeric = typeof compactHeight === 'number' && typeof expandedHeight === 'number';
  return <motion.div className="relative min-w-0" data-expanded-map data-expanded={expanded}
    data-motion-mode={reducedMotion ? 'reduced' : 'animated'} initial={false}
    animate={numeric ? { height } : undefined} style={numeric ? undefined : { height }}
    transition={{ duration: reducedMotion ? 0 : expanded ? 0.24 : 0.18, ease: [0.16, 1, 0.3, 1] }}>
    {children}
  </motion.div>;
}
