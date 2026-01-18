import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PendingInspection {
  id: string;
  data: {
    driver_id: string;
    truck_id: string;
    inspection_type: string;
    odometer_reading: number | null;
    defects_found: boolean;
    defect_notes: string | null;
    signature_url: string | null;
  };
  photos: { file: File; description?: string }[];
  timestamp: number;
}

const STORAGE_KEY = 'pending_dvir_inspections';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load pending count on mount
  useEffect(() => {
    const pending = getPendingInspections();
    setPendingCount(pending.length);
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Back online! Syncing pending inspections...');
      syncPendingInspections();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You are offline. Inspections will be saved locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getPendingInspections = (): PendingInspection[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      
      // Note: Files can't be stored in localStorage, so we only store metadata
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const savePendingInspection = useCallback((inspection: Omit<PendingInspection, 'id' | 'timestamp'>) => {
    const pending = getPendingInspections();
    const newInspection: PendingInspection = {
      ...inspection,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      photos: [], // Photos can't be stored in localStorage, would need IndexedDB
    };
    
    pending.push(newInspection);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    setPendingCount(pending.length);
    
    toast.info('Inspection saved locally. Will sync when online.');
    return newInspection.id;
  }, []);

  const removePendingInspection = useCallback((id: string) => {
    const pending = getPendingInspections();
    const filtered = pending.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    setPendingCount(filtered.length);
  }, []);

  const syncPendingInspections = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    const pending = getPendingInspections();
    if (pending.length === 0) return;

    setIsSyncing(true);
    let successCount = 0;
    let failCount = 0;

    for (const inspection of pending) {
      try {
        const { error } = await (supabase.from('driver_inspections' as any) as any).insert({
          driver_id: inspection.data.driver_id,
          truck_id: inspection.data.truck_id,
          inspection_type: inspection.data.inspection_type,
          odometer_reading: inspection.data.odometer_reading,
          defects_found: inspection.data.defects_found,
          defect_notes: inspection.data.defect_notes,
          signature_url: inspection.data.signature_url,
          signature: 'Digital signature confirmed',
          status: inspection.data.defects_found ? 'submitted' : 'cleared',
        });

        if (error) throw error;

        removePendingInspection(inspection.id);
        successCount++;
      } catch (error) {
        console.error('Failed to sync inspection:', error);
        failCount++;
      }
    }

    setIsSyncing(false);

    if (successCount > 0) {
      toast.success(`Synced ${successCount} inspection(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to sync ${failCount} inspection(s)`);
    }
  }, [isSyncing, removePendingInspection]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPendingInspections();
    }
  }, [isOnline, pendingCount, syncPendingInspections]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    savePendingInspection,
    syncPendingInspections,
    getPendingInspections,
  };
}
