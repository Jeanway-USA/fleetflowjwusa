import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Package, MapPin, GripVertical, Calendar, Inbox, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';

interface UnassignedLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  pickup_date: string | null;
  delivery_date: string | null;
  driver_id: string | null;
  booked_miles: number | null;
}

function LoadCard({ load }: { load: UnassignedLoad }) {
  const [dragging, setDragging] = useState(false);

  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-load-id', load.id);
    e.dataTransfer.setData('application/x-load-json', JSON.stringify(load));
    // Fallback plain text (some browsers require it)
    e.dataTransfer.setData('text/plain', load.landstar_load_id || load.id);
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => setDragging(false)}
      className={`group p-3 rounded-lg border bg-card cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-sm transition-all ${
        dragging ? 'opacity-50 ring-2 ring-primary' : 'border-border'
      }`}
      title="Drag onto a driver row on the Fleet Timeline to assign"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Package className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-semibold text-sm truncate">
                {load.landstar_load_id || load.id.slice(0, 8)}
              </span>
            </div>
            {load.pickup_date && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0 gap-1">
                <Calendar className="h-2.5 w-2.5" />
                {format(parseISO(load.pickup_date), 'MMM d')}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
              <span className="truncate">{load.origin || '—'}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 text-red-500 shrink-0" />
              <span className="truncate">{load.destination || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadList({ loads, isLoading }: { loads: UnassignedLoad[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!loads || loads.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Check className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-70" />
        <p className="text-sm font-medium">All loads assigned</p>
        <p className="text-xs mt-1">No unassigned freight right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {loads.map((load) => (
        <LoadCard key={load.id} load={load} />
      ))}
    </div>
  );
}

export function UnassignedLoadsDrawer() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const { data: loads, isLoading } = useQuery({
    queryKey: ['timeline-unassigned-loads'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date, driver_id')
        .is('driver_id', null)
        .in('status', ['pending', 'booked'])
        .order('pickup_date', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as UnassignedLoad[];
    },
  });

  const count = loads?.length ?? 0;

  if (isMobile) {
    return (
      <div id="assign-driver" className="scroll-mt-20">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full gap-2 justify-between">
              <span className="flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Unassigned Loads
              </span>
              <Badge variant="secondary" className="h-5">
                {count}
              </Badge>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[75vh] flex flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                Unassigned Loads ({count})
              </SheetTitle>
              <p className="text-xs text-muted-foreground text-left">
                Drag a card onto a driver row on the Fleet Timeline to assign.
              </p>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto mt-4 pr-1">
              <LoadList loads={loads} isLoading={isLoading} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <Card id="assign-driver" className="card-elevated scroll-mt-20 lg:sticky lg:top-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-primary" />
          Unassigned Loads
          <Badge variant="secondary" className="ml-auto h-5">
            {count}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Drag onto a driver row to assign.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="max-h-[560px] overflow-y-auto pr-1">
          <LoadList loads={loads} isLoading={isLoading} />
        </div>
      </CardContent>
    </Card>
  );
}
