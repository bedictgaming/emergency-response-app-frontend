'use client';

import { useCallback, useRef, useState } from 'react';
import { Map as LeafletMap } from 'leaflet';
import { createLeafletContext, LeafletContext, type LeafletContextInterface } from '@react-leaflet/core';
import type { MapContainerProps } from 'react-leaflet';
import { releaseDetachedMap } from '@/lib/mapHostLifetime';

type OwnedMap = { node: HTMLDivElement; map: LeafletMap; removed: boolean };

/** Own the map for the lifetime of its DOM host, not a replayable Effect.
 * React Activity/Fast Refresh can clean up Effects while retaining their refs
 * and connected DOM. Removing Leaflet then leaves child layers a dead context.
 * A real detached host is disposed once, after the React commit has finished.
 */
export function LifecycleMapContainer({ children, className, id, placeholder, style, ...mapProps }: MapContainerProps) {
  const [initial] = useState({ className, id, placeholder, style, options: mapProps });
  const owner = useRef<OwnedMap | null>(null);
  const [context, setContext] = useState<LeafletContextInterface | null>(null);

  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node === null) {
      releaseDetachedMap(owner.current, detached => {
        if (owner.current === detached) owner.current = null;
      });
      return;
    }
    if (owner.current?.node === node && !owner.current.removed) return;

    const { bounds, boundsOptions, center, whenReady, zoom, ...options } = initial.options;
    const map = new LeafletMap(node, options);
    owner.current = { node, map, removed: false };
    if (center != null && zoom != null) map.setView(center, zoom);
    else if (bounds != null) map.fitBounds(bounds, boundsOptions);
    if (whenReady) map.whenReady(whenReady);
    setContext(createLeafletContext(map));
  }, [initial]);

  return <div ref={attach} className={initial.className} id={initial.id} style={initial.style}>
    {context ? <LeafletContext value={context}>{children}</LeafletContext> : initial.placeholder ?? null}
  </div>;
}
