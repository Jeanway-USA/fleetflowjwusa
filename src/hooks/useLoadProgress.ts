import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useOptimisticLoadStatus } from '@/hooks/useOptimisticLoadStatus';
import { nextStatusOf, progressLabel, statusLabel } from '@/lib/driver/load';

interface ProgressLoad {
  id: string;
  status: string;
  pod_required?: boolean;
}

/**
 * Moves a load one step along its trip, the same way from every screen. Starting a load asks for the starting
 * odometer; finishing it asks for proof of delivery (when the load needs it) and the ending odometer; every other
 * step is saved at once, or queued on the phone when there is no signal and sent when it comes back.
 */
export function useLoadProgress(load: ProgressLoad | undefined, onStatusUpdate?: () => void) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [startOdometerOpen, setStartOdometerOpen] = useState(false);
  const [endOdometerOpen, setEndOdometerOpen] = useState(false);
  const { isOnline, enqueue } = useOfflineQueue();
  const { applyOptimistic } = useOptimisticLoadStatus();

  const nextStatus = load ? nextStatusOf(load.status) : null;

  const run = async () => {
    if (!load || !nextStatus) return;

    // Intercept: starting a load, capture odometer first.
    if (nextStatus === 'in_transit') {
      setStartOdometerOpen(true);
      return;
    }

    // Intercept: completing a load, capture proof of delivery (when required) and the ending odometer.
    if (nextStatus === 'delivered') {
      if (load.pod_required !== false) setPodOpen(true);
      else setEndOdometerOpen(true);
      return;
    }

    if (!isOnline) {
      enqueue('load_status_update', { id: load.id, status: nextStatus });
      toast.success('Status update saved. Will sync when online.');
      onStatusUpdate?.();
      return;
    }

    // Optimistic: update the cache immediately, then attempt the network write.
    const { commit, rollback } = applyOptimistic(load.id, { status: nextStatus });
    onStatusUpdate?.();

    setIsUpdating(true);
    try {
      const { error } = await supabase.from('fleet_loads').update({ status: nextStatus }).eq('id', load.id);
      if (error) throw error;
      toast.success(`Load status updated to ${statusLabel(nextStatus)}`);
      commit();
    } catch (error) {
      console.error('Error updating status:', error);
      rollback();
      toast.error('Could not update the status. Try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    nextStatus,
    label: load ? progressLabel(load.status) : '',
    isUpdating,
    run,
    dialogs: { podOpen, setPodOpen, startOdometerOpen, setStartOdometerOpen, endOdometerOpen, setEndOdometerOpen },
  };
}

export type LoadProgress = ReturnType<typeof useLoadProgress>;
