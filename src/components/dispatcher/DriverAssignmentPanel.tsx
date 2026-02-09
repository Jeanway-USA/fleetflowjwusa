import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, GripVertical, Package, MapPin, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface AvailableDriver {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

interface UnassignedLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  pickup_date: string | null;
}

export function DriverAssignmentPanel() {
  const queryClient = useQueryClient();
  const [draggedDriver, setDraggedDriver] = useState<AvailableDriver | null>(null);
  const [assigningLoad, setAssigningLoad] = useState<string | null>(null);

  // Fetch available drivers (not on active loads)
  const { data: availableDrivers, isLoading: driversLoading } = useQuery({
    queryKey: ['available-drivers-assignment'],
    queryFn: async () => {
      const { data: drivers } = await supabase
        .from('drivers_public_view')
        .select('id, first_name, last_name, phone')
        .eq('status', 'active');

      const { data: activeLoads } = await supabase
        .from('fleet_loads')
        .select('driver_id')
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading']);

      const assignedDriverIds = new Set(activeLoads?.map(l => l.driver_id).filter(Boolean));
      
      return drivers?.filter(d => !assignedDriverIds.has(d.id)) as AvailableDriver[];
    },
  });

  // Fetch unassigned loads (booked without driver)
  const { data: unassignedLoads, isLoading: loadsLoading } = useQuery({
    queryKey: ['unassigned-loads-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, status, pickup_date')
        .in('status', ['pending', 'booked', 'assigned'])
        .is('driver_id', null)
        .order('pickup_date', { ascending: true });
      
      if (error) throw error;
      return data as UnassignedLoad[];
    },
  });

  const handleDragStart = (driver: AvailableDriver) => {
    setDraggedDriver(driver);
  };

  const handleDragEnd = () => {
    setDraggedDriver(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (loadId: string) => {
    if (!draggedDriver) return;

    setAssigningLoad(loadId);
    
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ 
          driver_id: draggedDriver.id,
          status: 'assigned'
        })
        .eq('id', loadId);

      if (error) throw error;

      toast.success(`Assigned ${draggedDriver.first_name} ${draggedDriver.last_name} to load`);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['available-drivers-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['unassigned-loads-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
      queryClient.invalidateQueries({ queryKey: ['dispatcher-stats'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-pickups-dispatcher'] });
    } catch (error) {
      console.error('Assignment error:', error);
      toast.error('Failed to assign driver');
    } finally {
      setAssigningLoad(null);
      setDraggedDriver(null);
    }
  };

  const isLoading = driversLoading || loadsLoading;

  if (isLoading) {
    return (
      <Card className="card-elevated h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Quick Assign
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Quick Assign
        </CardTitle>
        <CardDescription className="text-xs">
          Drag driver to load to assign
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available Drivers */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Available Drivers ({availableDrivers?.length || 0})
          </p>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {availableDrivers && availableDrivers.length > 0 ? (
              availableDrivers.map((driver) => (
                <div
                  key={driver.id}
                  draggable
                  onDragStart={() => handleDragStart(driver)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-2 rounded-md border border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors ${
                    draggedDriver?.id === driver.id ? 'opacity-50 ring-2 ring-primary' : ''
                  }`}
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {driver.first_name} {driver.last_name}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20 shrink-0">
                    Available
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                No available drivers
              </p>
            )}
          </div>
        </div>

        {/* Unassigned Loads */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Needs Driver ({unassignedLoads?.length || 0})
          </p>
          <div className="space-y-1 max-h-[180px] overflow-y-auto">
            {unassignedLoads && unassignedLoads.length > 0 ? (
              unassignedLoads.map((load) => (
                <div
                  key={load.id}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(load.id)}
                  className={`p-2 rounded-md border transition-all ${
                    draggedDriver
                      ? 'border-dashed border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border bg-muted/30'
                  } ${assigningLoad === load.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <Package className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        {load.landstar_load_id || load.id.slice(0, 8)}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        <span className="truncate">{load.origin}</span>
                        <span>→</span>
                        <span className="truncate">{load.destination}</span>
                      </div>
                    </div>
                  </div>
                  {draggedDriver && (
                    <p className="text-xs text-primary mt-1 text-center">
                      Drop to assign {draggedDriver.first_name}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Check className="h-5 w-5 mx-auto mb-1 text-green-500" />
                <p className="text-xs">All loads assigned</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
