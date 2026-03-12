import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck, User, AlertTriangle, Wrench, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { addDays, isBefore } from 'date-fns';

interface TruckData {
  id: string;
  unit_number: string;
  status: string;
  next_inspection_date: string | null;
  current_driver: { first_name: string; last_name: string } | null;
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle }> = {
  active: { label: 'Active', className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
  in_shop: { label: 'In Shop', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Wrench },
  out_of_service: { label: 'Out of Service', className: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
};

export function TruckStatusGrid() {
  const navigate = useNavigate();

  const { data: trucks, isLoading } = useQuery({
    queryKey: ['trucks-status-dispatcher'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select(`
          id,
          unit_number,
          status,
          next_inspection_date,
          current_driver:drivers!trucks_current_driver_id_fkey(first_name, last_name)
        `)
        .order('unit_number');
      
      if (error) throw error;
      return data as TruckData[];
    },
  });

  const hasInspectionWarning = (truck: TruckData) => {
    if (!truck.next_inspection_date) return false;
    return isBefore(new Date(truck.next_inspection_date), addDays(new Date(), 14));
  };

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Truck Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeTrucks = trucks?.filter(t => t.status === 'active') || [];
  const inShopTrucks = trucks?.filter(t => t.status === 'in_shop') || [];

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Truck Status
            </CardTitle>
            <CardDescription>
              {activeTrucks.length} active • {inShopTrucks.length} in shop
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/trucks')}>
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {trucks && trucks.length > 0 ? (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 max-h-[300px] overflow-y-auto pr-1">
            {trucks.map((truck) => {
              const config = statusConfig[truck.status] || statusConfig.active;
              const inspectionWarning = hasInspectionWarning(truck);
              
              return (
                <div
                  key={truck.id}
                  className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate('/trucks')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">Unit {truck.unit_number}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <User className="h-3 w-3" />
                        <span className="truncate">
                          {truck.current_driver 
                            ? `${truck.current_driver.first_name} ${truck.current_driver.last_name}`
                            : 'Unassigned'}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className={`${config.className} shrink-0`}>
                      <config.icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>
                  
                  {inspectionWarning && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Inspection due soon</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No trucks found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
