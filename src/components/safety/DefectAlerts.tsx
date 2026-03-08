import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Truck, User, Clock } from 'lucide-react';

interface DefectAlertsProps {
  onConvertToWorkOrder?: (data: { truck_id: string; description: string }) => void;
}

export function DefectAlerts({ onConvertToWorkOrder }: DefectAlertsProps) {
  const { data: defectInspections = [], isLoading } = useQuery({
    queryKey: ['defect-inspections'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('driver_inspections' as any) as any)
        .select('*, trucks(*), drivers(*)')
        .eq('defects_found', true)
        .gte('inspection_date', subDays(new Date(), 7).toISOString())
        .order('inspection_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading || defectInspections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mb-6">
      {defectInspections.map((inspection: any) => (
        <Alert key={inspection.id} variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            Inspection Defect Reported
            <Badge variant="destructive" className="text-xs">
              {inspection.inspection_type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'}
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <p className="text-sm mb-2">{inspection.defect_notes || 'Defect reported - no details provided'}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              {inspection.trucks && (
                <span className="flex items-center gap-1">
                  <Truck className="h-3 w-3" />
                  Truck: {inspection.trucks.unit_number}
                </span>
              )}
              {inspection.drivers && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {inspection.drivers.first_name} {inspection.drivers.last_name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(inspection.inspection_date), 'MMM d, yyyy h:mm a')}
              </span>
            </div>
            {onConvertToWorkOrder && inspection.trucks && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() => onConvertToWorkOrder({
                  truck_id: inspection.truck_id,
                  description: `DVIR Defect (${inspection.inspection_type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} - ${inspection.drivers ? `${inspection.drivers.first_name} ${inspection.drivers.last_name}` : 'Unknown Driver'}): ${inspection.defect_notes || 'No details provided'}`,
                })}
              >
                <Wrench className="h-3 w-3" />
                Convert to Work Order
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
