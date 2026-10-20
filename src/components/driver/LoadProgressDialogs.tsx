import type { LoadProgress } from '@/hooks/useLoadProgress';
import { ProofOfDeliveryDialog } from './ProofOfDeliveryDialog';
import { StartingOdometerDialog } from './StartingOdometerDialog';
import { EndingOdometerDialog } from './EndingOdometerDialog';

interface Props {
  progress: LoadProgress;
  load: {
    id: string;
    landstar_load_id: string | null;
    destination: string;
    start_miles?: number | null;
    driver_id?: string | null;
  };
  driverId?: string | null;
  onStatusUpdate?: () => void;
}

/** The three steps a load can stop at on the way: starting odometer, proof of delivery, ending odometer. */
export function LoadProgressDialogs({ progress, load, driverId, onStatusUpdate }: Props) {
  const d = progress.dialogs;
  const owner = driverId ?? load.driver_id ?? null;
  return (
    <>
      {owner && (
        <ProofOfDeliveryDialog
          open={d.podOpen}
          onOpenChange={d.setPodOpen}
          loadId={load.id}
          loadNumber={load.landstar_load_id}
          destination={load.destination}
          driverId={owner}
          startMiles={load.start_miles ?? null}
          onComplete={() => onStatusUpdate?.()}
        />
      )}
      <StartingOdometerDialog
        open={d.startOdometerOpen}
        onOpenChange={d.setStartOdometerOpen}
        loadId={load.id}
        loadNumber={load.landstar_load_id}
        nextStatus="in_transit"
        onComplete={() => onStatusUpdate?.()}
      />
      <EndingOdometerDialog
        open={d.endOdometerOpen}
        onOpenChange={d.setEndOdometerOpen}
        loadId={load.id}
        loadNumber={load.landstar_load_id}
        startMiles={load.start_miles ?? null}
        driverId={owner}
        nextStatus="delivered"
        onComplete={() => onStatusUpdate?.()}
      />
    </>
  );
}
