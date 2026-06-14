import { useOfflineDocumentQueue } from '@/hooks/useOfflineDocumentQueue';

/**
 * Renderless component: keeps the offline document queue listener
 * mounted so queued BOLs/receipts auto-drain to Supabase as soon as
 * the device regains connectivity, even if the upload dialog is closed.
 */
export function DocumentSyncBootstrap() {
  useOfflineDocumentQueue();
  return null;
}
