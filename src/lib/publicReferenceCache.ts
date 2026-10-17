/** For public reference lists only, never accounts, incidents, evidence or permissions. */
export function createPublicReferenceCache<T>(ttlMs = 60_000, now = Date.now) {
  let value: T | undefined;
  let expiresAt = 0;
  let pending: Promise<T> | undefined;
  let generation = 0;
  return {
    clear() { generation++; value = undefined; expiresAt = 0; pending = undefined; },
    async read(load: () => Promise<T>): Promise<T> {
      if (value !== undefined && now() < expiresAt) return structuredClone(value);
      if (!pending) {
        const started = generation;
        const current = Promise.resolve().then(load).then(result => {
          if (started === generation) { value = structuredClone(result); expiresAt = now() + ttlMs; }
          return result;
        }).finally(() => { if (pending === current) pending = undefined; });
        pending = current;
      }
      return structuredClone(await pending);
    },
  };
}
