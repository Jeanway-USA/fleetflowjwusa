import { usePMSchedule } from '@/hooks/useMaintenanceData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthBar, InspectionCountdown } from './HealthBar';
import { Wrench } from 'lucide-react';

interface PreventiveMaintenanceTabProps {
  onViewTruck: (truckId: string) => void;
}

export function PreventiveMaintenanceTab({ onViewTruck }: PreventiveMaintenanceTabProps) {
  const { data: trucks, isLoading } = usePMSchedule();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!trucks?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No Trucks Found</h3>
        <p className="text-sm text-muted-foreground">
          Add trucks to your fleet to see preventive maintenance schedules.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Unit #</TableHead>
            <TableHead className="w-[120px]">Odometer</TableHead>
            <TableHead>Oil Change</TableHead>
            <TableHead>Tires</TableHead>
            <TableHead>120-Day Inspection</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trucks.map(truck => {
            const oilChangeSchedule = truck.schedules.find(s => s.service_name === 'Oil Change');
            const tiresSchedule = truck.schedules.find(s => s.service_name === 'Tire Replacement');
            const inspectionSchedule = truck.schedules.find(s => s.service_name === '120-Day Inspection');
            
            const currentOdometer = truck.current_odometer || 0;

            return (
              <TableRow 
                key={truck.id}
                className="cursor-pointer"
                onClick={() => onViewTruck(truck.id)}
              >
                <TableCell className="font-medium">{truck.unit_number}</TableCell>
                <TableCell>{currentOdometer.toLocaleString()} mi</TableCell>
                <TableCell>
                  {oilChangeSchedule ? (
                    <HealthBar
                      serviceName="Oil"
                      currentValue={currentOdometer}
                      lastPerformedValue={oilChangeSchedule.last_performed_miles || 0}
                      intervalValue={oilChangeSchedule.interval_miles || 15000}
                      unit="miles"
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">Not scheduled</span>
                  )}
                </TableCell>
                <TableCell>
                  {tiresSchedule ? (
                    <HealthBar
                      serviceName="Tires"
                      currentValue={currentOdometer}
                      lastPerformedValue={tiresSchedule.last_performed_miles || 0}
                      intervalValue={tiresSchedule.interval_miles || 80000}
                      unit="miles"
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">Not scheduled</span>
                  )}
                </TableCell>
                <TableCell>
                  {inspectionSchedule ? (
                    <InspectionCountdown
                      lastInspectionDate={inspectionSchedule.last_performed_date}
                      intervalDays={inspectionSchedule.interval_days || 120}
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">Not scheduled</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
