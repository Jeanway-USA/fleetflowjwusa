import { usePMSchedule, TruckWithSchedules, ManufacturerService } from '@/hooks/useMaintenanceData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthBar, InspectionCountdown } from './HealthBar';
import { Wrench } from 'lucide-react';

interface PreventiveMaintenanceTabProps {
  onViewTruck: (truckId: string) => void;
}

// Group trucks by manufacturer for proper column headers
function groupTrucksByManufacturer(trucks: TruckWithSchedules[]) {
  const freightlinerTrucks = trucks.filter(t => 
    t.make?.toLowerCase() === 'freightliner' && t.manufacturer_services.length > 0
  );
  const otherTrucks = trucks.filter(t => 
    t.make?.toLowerCase() !== 'freightliner' || t.manufacturer_services.length === 0
  );
  
  return { freightlinerTrucks, otherTrucks };
}

function FreightlinerPMTable({ 
  trucks, 
  onViewTruck 
}: { 
  trucks: TruckWithSchedules[]; 
  onViewTruck: (truckId: string) => void;
}) {
  if (trucks.length === 0) return null;

  // Get service columns from first truck's manufacturer services
  const serviceColumns = trucks[0].manufacturer_services.map(s => ({
    code: s.profile.service_code,
    name: s.profile.service_name,
  }));

  return (
    <div className="rounded-md border">
      <div className="bg-muted/50 px-4 py-2 border-b">
        <h3 className="font-medium text-sm">Freightliner Cascadia Schedule II</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Unit #</TableHead>
            <TableHead className="w-[120px]">Odometer</TableHead>
            {serviceColumns.map(col => (
              <TableHead key={col.code}>{col.code}</TableHead>
            ))}
            <TableHead>120-Day</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trucks.map((truck) => {
            const inspectionSchedule = truck.schedules.find(s => s.service_name === '120-Day Inspection');
            const currentOdometer = truck.calculated_odometer || 0;

            return (
              <TableRow 
                key={truck.id}
                className="cursor-pointer"
                onClick={() => onViewTruck(truck.id)}
              >
                <TableCell className="font-medium">{truck.unit_number}</TableCell>
                <TableCell>{currentOdometer.toLocaleString()} mi</TableCell>
                {truck.manufacturer_services.map((service: ManufacturerService) => (
                  <TableCell key={service.profile.id}>
                    <HealthBar
                      serviceName={service.profile.service_name}
                      currentValue={service.miles_since_service}
                      lastPerformedValue={0}
                      intervalValue={service.profile.interval_miles || 25000}
                      unit="miles"
                      baseline={service.baseline}
                      description={service.profile.description}
                    />
                  </TableCell>
                ))}
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

function GenericPMTable({ 
  trucks, 
  onViewTruck 
}: { 
  trucks: TruckWithSchedules[]; 
  onViewTruck: (truckId: string) => void;
}) {
  if (trucks.length === 0) return null;

  return (
    <div className="rounded-md border">
      {trucks.some(t => t.make) && (
        <div className="bg-muted/50 px-4 py-2 border-b">
          <h3 className="font-medium text-sm">Other Trucks</h3>
        </div>
      )}
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
          {trucks.map((truck) => {
            const oilChangeSchedule = truck.schedules.find(s => s.service_name === 'Oil Change');
            const tiresSchedule = truck.schedules.find(s => s.service_name === 'Tire Replacement');
            const inspectionSchedule = truck.schedules.find(s => s.service_name === '120-Day Inspection');

            const currentOdometer = truck.calculated_odometer || 0;

            // PM usage is based on delivered load actual_miles since the last performed date
            const oilCurrentValue = (oilChangeSchedule?.last_performed_miles || 0) + (truck.miles_since_oil_change || 0);
            const tireCurrentValue = (tiresSchedule?.last_performed_miles || 0) + (truck.miles_since_tire_replacement || 0);

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
                      currentValue={oilCurrentValue}
                      lastPerformedValue={oilChangeSchedule.last_performed_miles || 0}
                      intervalValue={oilChangeSchedule.interval_miles || 15000}
                      unit="miles"
                      baseline={truck.oil_change_baseline}
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">Not scheduled</span>
                  )}
                </TableCell>
                <TableCell>
                  {tiresSchedule ? (
                    <HealthBar
                      serviceName="Tires"
                      currentValue={tireCurrentValue}
                      lastPerformedValue={tiresSchedule.last_performed_miles || 0}
                      intervalValue={tiresSchedule.interval_miles || 80000}
                      unit="miles"
                      baseline={truck.tire_replacement_baseline}
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

  const { freightlinerTrucks, otherTrucks } = groupTrucksByManufacturer(trucks);

  return (
    <div className="space-y-6">
      <FreightlinerPMTable trucks={freightlinerTrucks} onViewTruck={onViewTruck} />
      <GenericPMTable trucks={otherTrucks} onViewTruck={onViewTruck} />
    </div>
  );
}
