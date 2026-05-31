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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_LOAD_STATUSES = new Set([
  'pending',
  'assigned',
  'loading',
  'in_transit',
  'delivered',
  'cancelled',
]);
const ALLOWED_EXPENSE_TYPES = new Set([
  'Fuel',
  'DEF',
  'Fuel Discount',
  'Tolls',
  'Scale',
  'Lumper',
  'Maintenance',
  'Repairs',
  'Insurance',
  'Other',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function processAction(action: OfflineAction): Promise<void> {
  switch (action.type) {
    case 'load_status_update': {
      if (!isPlainObject(action.payload)) throw new Error('Invalid payload');
      const id = action.payload.id;
      const status = action.payload.status;
      if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Error('Invalid load id');
      if (typeof status !== 'string' || !ALLOWED_LOAD_STATUSES.has(status)) {
        throw new Error('Invalid load status');
      }
      const { error } = await supabase
        .from('fleet_loads')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      break;
    }
    case 'fuel_receipt': {
      if (!isPlainObject(action.payload)) throw new Error('Invalid payload');
      const p = action.payload;
      const expense_type = p.expense_type;
      const amount = p.amount;
      const expense_date = p.expense_date;
      if (typeof expense_type !== 'string' || !ALLOWED_EXPENSE_TYPES.has(expense_type)) {
        throw new Error('Invalid expense_type');
      }
      if (typeof amount !== 'number' || !isFinite(amount) || amount < 0 || amount > 1_000_000) {
        throw new Error('Invalid amount');
      }
      if (typeof expense_date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(expense_date)) {
        throw new Error('Invalid expense_date');
      }
      if (p.gallons !== undefined && p.gallons !== null) {
        if (typeof p.gallons !== 'number' || !isFinite(p.gallons) || p.gallons < 0 || p.gallons > 10_000) {
          throw new Error('Invalid gallons');
        }
      }
      if (p.truck_id !== undefined && p.truck_id !== null && (typeof p.truck_id !== 'string' || !UUID_RE.test(p.truck_id))) {
        throw new Error('Invalid truck_id');
      }
      const { error } = await supabase
        .from('expenses')
        .insert(p as any);
      if (error) throw error;
      break;
    }
    case 'dvir_inspection': {
      if (!isPlainObject(action.payload)) throw new Error('Invalid payload');
      const p = action.payload;
      if (typeof p.driver_id !== 'string' || !UUID_RE.test(p.driver_id)) {
        throw new Error('Invalid driver_id');
      }
      if (p.truck_id !== undefined && p.truck_id !== null && (typeof p.truck_id !== 'string' || !UUID_RE.test(p.truck_id))) {
        throw new Error('Invalid truck_id');
      }
      if (p.inspection_type !== undefined && typeof p.inspection_type !== 'string') {
        throw new Error('Invalid inspection_type');
      }
      if (p.odometer_reading !== undefined && p.odometer_reading !== null) {
        if (typeof p.odometer_reading !== 'number' || !isFinite(p.odometer_reading) || p.odometer_reading < 0) {
          throw new Error('Invalid odometer_reading');
        }
      }
      if (p.defect_notes !== undefined && p.defect_notes !== null) {
        if (typeof p.defect_notes !== 'string' || p.defect_notes.length > 5000) {
          throw new Error('Invalid defect_notes');
        }
      }
      const { error } = await (supabase.from('driver_inspections' as any) as any)
        .insert(p);
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
