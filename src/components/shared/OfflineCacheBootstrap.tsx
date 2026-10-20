import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { clearSnapshot, restoreSnapshot, saveSnapshot } from '@/lib/offline-cache';
import { kvStore } from '@/lib/kv-store';

const SAVE_DELAY_MS = 2000;

/**
 * Renderless. When someone signs in it loads their saved copy (so screens open with the last data even with no
 * signal), keeps that copy up to date as new data arrives, and wipes it the moment they sign out.
 */
export function OfflineCacheBootstrap() {
  const client = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hadUser = useRef(false);

  useEffect(() => {
    if (!userId) {
      // Signed out after having been signed in: nothing of theirs stays on the phone.
      if (hadUser.current) void clearSnapshot(kvStore);
      hadUser.current = false;
      return;
    }
    hadUser.current = true;

    let timer: number | undefined;
    let cancelled = false;
    const save = () => {
      window.clearTimeout(timer);
      timer = undefined;
      if (!cancelled) void saveSnapshot(client, kvStore, userId);
    };
    const schedule = () => {
      if (timer === undefined) timer = window.setTimeout(save, SAVE_DELAY_MS);
    };

    void restoreSnapshot(client, kvStore, userId).catch(() => undefined);
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') schedule();
    });
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [client, userId]);

  return null;
}
