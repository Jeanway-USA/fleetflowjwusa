/**
 * IndexedDB-backed queue for document uploads that need to survive
 * loss of cell signal. Stores the (already-compressed) image Blob directly
 * — no base64 inflation, no localStorage 5 MB cap.
 */

const DB_NAME = 'lovable-doc-queue';
const DB_VERSION = 1;
const STORE = 'documents';

export interface QueuedDocumentInput {
  blob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType: string;
  driverId: string;
  uploadedBy: string;
  relatedType: string;
  relatedId: string;
  relatedLoadId?: string | null;
}

export interface QueuedDocument extends QueuedDocumentInput {
  id: string;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error('IndexedDB not available in this browser'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const resultPromise = Promise.resolve(fn(store));
      tx.oncomplete = () => resultPromise.then(resolve, reject);
      tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('IDB transaction error'));
    });
  } finally {
    db.close();
  }
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueDocument(input: QueuedDocumentInput): Promise<QueuedDocument> {
  const record: QueuedDocument = {
    ...input,
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
    attempts: 0,
  };
  await withStore('readwrite', (store) => reqAsPromise(store.put(record)));
  return record;
}

export async function listQueuedDocuments(): Promise<QueuedDocument[]> {
  if (!hasIndexedDB()) return [];
  try {
    return await withStore('readonly', (store) => reqAsPromise(store.getAll() as IDBRequest<QueuedDocument[]>));
  } catch {
    return [];
  }
}

export async function removeQueuedDocument(id: string): Promise<void> {
  await withStore('readwrite', (store) => reqAsPromise(store.delete(id)));
}

export async function incrementAttempt(id: string, error: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const existing = await reqAsPromise(store.get(id) as IDBRequest<QueuedDocument | undefined>);
    if (!existing) return;
    existing.attempts = (existing.attempts ?? 0) + 1;
    existing.lastError = error.slice(0, 500);
    await reqAsPromise(store.put(existing));
  });
}

export async function countQueued(): Promise<number> {
  if (!hasIndexedDB()) return 0;
  try {
    return await withStore('readonly', (store) => reqAsPromise(store.count()));
  } catch {
    return 0;
  }
}

export function isOfflineQueueSupported(): boolean {
  return hasIndexedDB();
}
