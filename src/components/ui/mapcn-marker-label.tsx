'use client';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Adapted from the supplied mapcn MarkerLabel presentation only.
// Leaflet owns positioning through Tooltip; no second MapLibre map/Carto provider.
export function MarkerLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-mapcn-marker-label className={cn('inline-block max-w-48 whitespace-normal rounded-md border border-red-200 bg-white px-2 py-1 text-center text-xs font-semibold leading-4 text-red-800 dark:border-red-800 dark:bg-slate-900 dark:text-red-200', className)}>{children}</span>;
}
