import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { MapPin } from 'lucide-react';
import { LoadingButton } from '@/components/shared/LoadingButton';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

interface GeofenceArrivalDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  distanceMiles: number | null;
  onConfirmed: () => void;
}

export function GeofenceArrivalDrawer({
  open,
  onOpenChange,
  loadId,
  distanceMiles,
  onConfirmed,
}: GeofenceArrivalDrawerProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('fleet_loads')
      .update({ status: 'unloading' })
      .eq('id', loadId);

    setLoading(false);

    if (error) {
      toast({ title: 'Error', description: 'Could not update load status.', variant: 'destructive' });
      return;
    }

    toast({ title: 'Status Updated', description: 'Load marked as Arrived / Unloading.' });
    onOpenChange(false);
    onConfirmed();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-6 w-6 text-primary" />
          </div>
          <DrawerTitle>You're near the destination</DrawerTitle>
          <DrawerDescription>
            {distanceMiles !== null
              ? `You are ${distanceMiles.toFixed(1)} miles away. Update load status to Arrived?`
              : 'Update load status to Arrived?'}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <LoadingButton loading={loading} onClick={handleConfirm} className="w-full">
            Confirm Arrival
          </LoadingButton>
          <DrawerClose asChild>
            <Button variant="outline" className="w-full">
              Dismiss
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
