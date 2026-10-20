import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaintenanceRequestForm } from './MaintenanceRequestForm';
import { SheetContent, Tile } from '@/components/driver/ui/driver-ui';

/** The "Issue" quick action: opens the maintenance report form for the driver's truck. */
export function ReportIssueTile({ driverId, truckId }: { driverId: string; truckId: string | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tile icon={<Wrench />} label="Issue" disabled={!truckId} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
          </DialogHeader>
          {truckId && <MaintenanceRequestForm driverId={driverId} truckId={truckId} onComplete={() => setOpen(false)} />}
        </SheetContent>
      </Dialog>
    </>
  );
}
