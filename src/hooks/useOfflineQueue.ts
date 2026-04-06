import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type OfflineActionType = 'load_status_update' | 'fuel_receipt' | 'dvir_inspection';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  timestamp: number;
}

const QUEUE_KEY = 'offline_action_queue';

function getQueue(): OfflineAction[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function processAction(action: OfflineAction): Promise<void> {
  switch (action.type) {
    case 'load_status_update': {
      const { id, status } = action.payload as { id: string; status: string };
      const { error } = await supabase
        .from('fleet_loads')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      break;
    }
    case 'fuel_receipt': {
      const { error } = await supabase
        .from('expenses')
        .insert(action.payload as any);
      if (error) throw error;
      break;
    }
    case 'dvir_inspection': {
      const { error } = await (supabase.from('driver_inspections' as any) as any)
        .insert(action.payload);
      if (error) throw error;
      break;
    }
    default:
      console.warn('Unknown offline action type:', action.type);
  }
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(() => getQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const enqueue = useCallback((type: OfflineActionType, payload: Record<string, unknown>) => {
    const queue = getQueue();
    const action: OfflineAction = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
    };
    queue.push(action);
    saveQueue(queue);
    setPendingCount(queue.length);
    toast.info('Action saved offline. Will sync when back online.');
    return action.id;
  }, []);

  const syncAll = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);

    let successCount = 0;
    let failCount = 0;
    const remaining: OfflineAction[] = [];

    for (const action of queue) {
      try {
        await processAction(action);
        successCount++;
      } catch (error) {
        console.error('Failed to sync action:', action.type, error);
        remaining.push(action);
        failCount++;
      }
    }

    saveQueue(remaining);
    setPendingCount(remaining.length);
    syncingRef.current = false;
    setIsSyncing(false);

    if (successCount > 0) {
      toast.success(`Synced ${successCount} pending action(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to sync ${failCount} action(s). Will retry later.`);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncAll();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncAll]);

  // Auto-sync on mount if online and items are pending
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncAll();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isOnline,
    pendingCount,
    isSyncing,
    enqueue,
    syncAll,
  };
}
