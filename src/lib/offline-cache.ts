import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

/**
 * A saved copy of the driver's data on the phone, so the app opens with no signal and shows the last thing it knew
 * instead of an empty screen. It holds only driver-related data, belongs to one signed-in person, expires after a
 * week, and is wiped on sign-out so a shared phone never shows someone else's numbers.
 */

export const CACHE_VERSION = 1;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_BYTES = 3 * 1024 * 1024;

/** Where a snapshot is kept. The IndexedDB version lives in `kv-store`; tests pass an in-memory one. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export const SNAPSHOT_KEY = 'driver-cache';

export interface Snapshot {
  version: number;
  userId: string;
  savedAt: number;
  state: DehydratedState;
}

const EXACT = new Set(['load-intermediate-stops', 'safety-bonus', 'pay-settings-landstar-split', 'self-driver', 'tax-documents']);

/**
 * Which queries are worth keeping: the driver's own screens. Live location is left out on purpose, since a saved
 * position goes stale in minutes and showing an old one as current would mislead.
 */
export function isPersistableKey(key: readonly unknown[]): boolean {
  const head = key[0];
  if (typeof head !== 'string') return false;
  if (/location/i.test(head)) return false;
  return head.startsWith('driver') || EXACT.has(head);
}

/** The queries to save from a client, as a plain object that survives JSON. */
export function buildSnapshot(client: QueryClient, userId: string, now = Date.now()): Snapshot {
  const state = dehydrate(client, {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && isPersistableKey(q.queryKey),
  });
  return { version: CACHE_VERSION, userId, savedAt: now, state: JSON.parse(JSON.stringify(state)) as DehydratedState };
}

/** Whether a saved snapshot may be used by this person right now. */
export function isUsable(snapshot: Snapshot | null | undefined, userId: string, now = Date.now()): snapshot is Snapshot {
  return !!snapshot && snapshot.version === CACHE_VERSION && snapshot.userId === userId && now - snapshot.savedAt <= MAX_AGE_MS && !!snapshot.state;
}

/**
 * Loads a saved snapshot into the client. Anything the client already fetched fresher is kept: hydrating never
 * overwrites newer data. Returns how many queries were restored.
 */
export async function restoreSnapshot(client: QueryClient, store: KeyValueStore, userId: string, now = Date.now()): Promise<number> {
  let snapshot: Snapshot | null = null;
  try {
    const raw = await store.get(SNAPSHOT_KEY);
    snapshot = raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return 0;
  }
  if (!isUsable(snapshot, userId, now)) {
    // Someone else's copy, an old one, or a different version: it is of no use here, so it goes.
    if (snapshot) await store.del(SNAPSHOT_KEY).catch(() => undefined);
    return 0;
  }
  const restorable = { ...snapshot.state, queries: snapshot.state.queries.filter((q) => isPersistableKey(q.queryKey)) };
  hydrate(client, restorable);
  return restorable.queries.length;
}

/** Saves the current snapshot. A copy over the size limit is skipped, not truncated. */
export async function saveSnapshot(client: QueryClient, store: KeyValueStore, userId: string, now = Date.now()): Promise<boolean> {
  const snapshot = buildSnapshot(client, userId, now);
  if (snapshot.state.queries.length === 0) return false;
  const raw = JSON.stringify(snapshot);
  if (raw.length > MAX_BYTES) return false;
  try {
    await store.set(SNAPSHOT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export async function clearSnapshot(store: KeyValueStore): Promise<void> {
  try {
    await store.del(SNAPSHOT_KEY);
  } catch {
    /* nothing to clear */
  }
}
