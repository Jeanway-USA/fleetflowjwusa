import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStorageProvider } from '@/hooks/useStorageProvider';
import {
  countQueued,
  enqueueDocument,
  incrementAttempt,
  listQueuedDocuments,
  removeQueuedDocument,
  type QueuedDocument,
  type QueuedDocumentInput,
} from '@/lib/offline-document-queue';

const SYNC_EVENT = 'lovable:doc-queue-changed';

function notifyChanged() {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

function extFromMime(mime: string, fallback = 'bin'): string {
  if (!mime) return fallback;
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'application/pdf') return 'pdf';
  const part = mime.split('/')[1];
  return part || fallback;
}

export function useOfflineDocumentQueue() {
  const { upload } = useStorageProvider();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const n = await countQueued();
    setQueuedCount(n);
  }, []);

  const enqueue = useCallback(
    async (input: QueuedDocumentInput): Promise<QueuedDocument> => {
      const record = await enqueueDocument(input);
      await refreshCount();
      notifyChanged();
      toast.info('Document queued — safe to close the app and drive.');
      return record;
    },
    [refreshCount]
  );

  const syncAll = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    const items = await listQueuedDocuments();
    if (items.length === 0) {
      setQueuedCount(0);
      return;
    }

    syncingRef.current = true;
    setIsSyncing(true);

    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
      try {
        const ext = extFromMime(item.mimeType);
        const filePath = `${item.driverId}/${Date.now()}-${item.id}.${ext}`;
        const fileForUpload =
          item.blob instanceof File
            ? item.blob
            : new File([item.blob], item.fileName || `document.${ext}`, { type: item.mimeType });

        const { path, error: uploadError } = await upload('documents', filePath, fileForUpload);
        if (uploadError || !path) throw uploadError || new Error('Upload failed');

        const { error: dbError } = await supabase.from('documents').insert({
          file_name: item.fileName,
          file_path: path,
          file_size: item.fileSize,
          document_type: item.documentType,
          uploaded_by: item.uploadedBy,
          related_type: item.relatedType,
          related_id: item.relatedId,
        });
        if (dbError) throw dbError;

        await removeQueuedDocument(item.id);
        successCount++;
      } catch (err: any) {
        failCount++;
        const message = err?.message || String(err);
        try {
          await incrementAttempt(item.id, message);
        } catch {
          /* swallow IDB write errors so loop continues */
        }
        // If we lost connectivity mid-drain, bail out and wait for next online event.
        if (!navigator.onLine) break;
      }
    }

    syncingRef.current = false;
    setIsSyncing(false);
    setLastSyncedAt(Date.now());
    await refreshCount();
    notifyChanged();

    if (successCount > 0) {
      toast.success(
        `Uploaded ${successCount} queued document${successCount === 1 ? '' : 's'}.`
      );
    }
    if (failCount > 0 && navigator.onLine) {
      toast.error(
        `Couldn't upload ${failCount} queued document${failCount === 1 ? '' : 's'}. Will retry.`
      );
    }
  }, [refreshCount, upload]);

  // Listen for online/offline + cross-hook queue mutations.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncAll();
    };
    const handleOffline = () => setIsOnline(false);
    const handleChanged = () => void refreshCount();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(SYNC_EVENT, handleChanged);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(SYNC_EVENT, handleChanged);
    };
  }, [refreshCount, syncAll]);

  // Initial load: count + opportunistic drain.
  useEffect(() => {
    void (async () => {
      await refreshCount();
      if (navigator.onLine) void syncAll();
    })();
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isOnline,
    queuedCount,
    isSyncing,
    lastSyncedAt,
    enqueue,
    syncAll,
  };
}
