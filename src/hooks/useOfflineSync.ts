import { useCallback } from 'react';
import { useOfflineQueue } from './useOfflineQueue';

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

export function useOfflineSync() {
  const { isOnline, pendingCount, isSyncing, enqueue, syncAll } = useOfflineQueue();

  const savePendingInspection = useCallback((inspection: Omit<PendingInspection, 'id' | 'timestamp'>) => {
    return enqueue('dvir_inspection', {
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
  }, [enqueue]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    savePendingInspection,
    syncPendingInspections: syncAll,
    getPendingInspections: () => [] as PendingInspection[], // Legacy compat
  };
}
