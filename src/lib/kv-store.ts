import type { KeyValueStore } from '@/lib/offline-cache';

const DB_NAME = 'fleetflow-cache';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

const LS_PREFIX = 'fleetflow-cache:';

/** IndexedDB holds the copy (no small size cap); where it is blocked, localStorage stands in. */
export const kvStore: KeyValueStore = {
  async get(key) {
    try {
      const v = await run<unknown>('readonly', (s) => s.get(key));
      return typeof v === 'string' ? v : null;
    } catch {
      try { return localStorage.getItem(LS_PREFIX + key); } catch { return null; }
    }
  },
  async set(key, value) {
    try {
      await run('readwrite', (s) => s.put(value, key));
    } catch {
      localStorage.setItem(LS_PREFIX + key, value);
    }
  },
  async del(key) {
    try {
      await run('readwrite', (s) => s.delete(key));
    } catch {
      /* fall through to localStorage */
    }
    try { localStorage.removeItem(LS_PREFIX + key); } catch { /* ignore */ }
  },
};
