export type MapHostLifetime = {
  node: { readonly isConnected: boolean };
  map: { remove: () => unknown };
  removed: boolean;
};

/** React may detach/reconnect refs in one commit without removing their DOM. */
export function releaseDetachedMap<T extends MapHostLifetime>(owned: T | null, onRemoved: (removed: T) => void) {
  queueMicrotask(() => {
    if (!owned || owned.removed || owned.node.isConnected) return;
    owned.removed = true;
    owned.map.remove();
    onRemoved(owned);
  });
}
