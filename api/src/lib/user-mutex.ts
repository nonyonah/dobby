/**
 * Serialize work per key (e.g. one Clerk user) so concurrent HTTP requests
 * cannot interleave destructive read-modify-write sequences.
 *
 * SCOPE: this is per-process. `npm start` runs a single `node dist/server.js`,
 * so it covers the current deployment, but it stops covering the moment a second
 * instance is added (or the process is clustered) — the keys would then be
 * unrelated per instance and two instances could still race. Anything that must
 * hold across instances needs a database-level guard instead — a conditional
 * `updateMany` that claims a row rather than serializing in memory.
 */
const chains = new Map<string, Promise<unknown>>();

export function runExclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
  const tail = chains.get(key) ?? Promise.resolve();
  const run = tail
    .catch(() => undefined)
    .then(work)
    .finally(() => {
      if (chains.get(key) === run) chains.delete(key);
    });
  chains.set(key, run);
  return run as Promise<T>;
}
