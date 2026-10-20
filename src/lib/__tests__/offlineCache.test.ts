import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { buildSnapshot, clearSnapshot, isPersistableKey, MAX_AGE_MS, restoreSnapshot, saveSnapshot, SNAPSHOT_KEY, type KeyValueStore } from '@/lib/offline-cache';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    async get(k) { return data.get(k) ?? null; },
    async set(k, v) { data.set(k, v); },
    async del(k) { data.delete(k); },
  };
};

const client = () => new QueryClient();
const seed = (c: QueryClient, key: unknown[], value: unknown) => c.setQueryData(key, value);

describe('which data is kept on the phone', () => {
  it('keeps the driver screens and their loads, stops, pay and bonus', () => {
    for (const k of ['driver-home/loads', 'driver_loads', 'driver_record', 'driver-weekly-loads', 'driver-page/settlements', 'load-intermediate-stops', 'safety-bonus', 'pay-settings-landstar-split', 'tax-documents']) {
      expect(isPersistableKey([k, 'x']), k).toBe(true);
    }
  });

  it('leaves out live location, which goes stale in minutes', () => {
    expect(isPersistableKey(['driver-location-sharing', 'd1'])).toBe(false);
    expect(isPersistableKey(['driver-home/location', 'd1'])).toBe(false);
  });

  it('leaves out everything that is not the driver screens', () => {
    for (const k of ['fleet_loads', 'executive-dashboard', 'expenses', 'shop', 'finance']) expect(isPersistableKey([k]), k).toBe(false);
    expect(isPersistableKey([])).toBe(false);
    expect(isPersistableKey([{ a: 1 }])).toBe(false);
  });
});

describe('saving and restoring', () => {
  it('restores what was saved into a fresh client, so screens open with data and no signal', async () => {
    const store = memory();
    const a = client();
    seed(a, ['driver-home/loads', 'd1'], [{ id: 'L1', status: 'in_transit' }]);
    seed(a, ['load-intermediate-stops', 'L1'], [{ id: 's1', status: 'pending' }]);
    expect(await saveSnapshot(a, store, 'u1')).toBe(true);

    const b = client();
    expect(await restoreSnapshot(b, store, 'u1')).toBe(2);
    expect(b.getQueryData(['driver-home/loads', 'd1'])).toEqual([{ id: 'L1', status: 'in_transit' }]);
    expect(b.getQueryData(['load-intermediate-stops', 'L1'])).toEqual([{ id: 's1', status: 'pending' }]);
  });

  it('never saves data that is not the driver screens', async () => {
    const store = memory();
    const a = client();
    seed(a, ['driver_loads', 'd1'], [1]);
    seed(a, ['expenses', 'all'], [{ secret: true }]);
    await saveSnapshot(a, store, 'u1');
    expect(store.data.get(SNAPSHOT_KEY)).not.toContain('secret');
  });

  it('does not save a query that failed or has no data', async () => {
    const a = client();
    await a.prefetchQuery({ queryKey: ['driver_loads', 'bad'], queryFn: async () => { throw new Error('offline'); }, retry: false });
    seed(a, ['driver_loads', 'ok'], [1]);
    const snap = buildSnapshot(a, 'u1');
    expect(snap.state.queries.map((q) => q.queryKey[1])).toEqual(['ok']);
  });

  it('saves nothing when there is nothing to save', async () => {
    const store = memory();
    expect(await saveSnapshot(client(), store, 'u1')).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('will not show one person the copy another person left on the phone, and removes it', async () => {
    const store = memory();
    const a = client();
    seed(a, ['driver_loads', 'd1'], ['theirs']);
    await saveSnapshot(a, store, 'user-A');

    const b = client();
    expect(await restoreSnapshot(b, store, 'user-B')).toBe(0);
    expect(b.getQueryData(['driver_loads', 'd1'])).toBeUndefined();
    expect(store.data.has(SNAPSHOT_KEY)).toBe(false);
  });

  it('ignores a copy older than a week', async () => {
    const store = memory();
    const a = client();
    seed(a, ['driver_loads', 'd1'], ['old']);
    const t0 = Date.now();
    await saveSnapshot(a, store, 'u1', t0);
    const b = client();
    expect(await restoreSnapshot(b, store, 'u1', t0 + MAX_AGE_MS + 1000)).toBe(0);
    expect(b.getQueryData(['driver_loads', 'd1'])).toBeUndefined();
  });

  it('never overwrites data the app already fetched more recently', async () => {
    const store = memory();
    const a = client();
    seed(a, ['driver_loads', 'd1'], ['saved copy']);
    await saveSnapshot(a, store, 'u1', Date.now() - 60_000);

    const b = client();
    b.setQueryData(['driver_loads', 'd1'], ['fresh from the server']);
    await restoreSnapshot(b, store, 'u1');
    expect(b.getQueryData(['driver_loads', 'd1'])).toEqual(['fresh from the server']);
  });

  it('survives a damaged or missing copy', async () => {
    const store = memory();
    store.data.set(SNAPSHOT_KEY, '{not json');
    expect(await restoreSnapshot(client(), store, 'u1')).toBe(0);
    expect(await restoreSnapshot(client(), memory(), 'u1')).toBe(0);
  });

  it('skips a copy over the size limit instead of cutting it', async () => {
    const store = memory();
    const a = client();
    seed(a, ['driver_loads', 'big'], 'x'.repeat(4 * 1024 * 1024));
    expect(await saveSnapshot(a, store, 'u1')).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('is wiped on sign-out', async () => {
    const store = memory();
    const a = client();
    seed(a, ['driver_loads', 'd1'], [1]);
    await saveSnapshot(a, store, 'u1');
    await clearSnapshot(store);
    expect(store.data.has(SNAPSHOT_KEY)).toBe(false);
  });
});
