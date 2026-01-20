import { useState, useMemo, useRef, useEffect } from 'react';
import { usePMSchedule, TruckWithSchedules, ManufacturerService } from '@/hooks/useMaintenanceData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthBar, InspectionCountdown } from './HealthBar';
import { CompactHealthDot, CompactInspectionDot } from './CompactHealthDot';
import { PMScheduleFilters, HealthStatus, ManufacturerFilter } from './PMScheduleFilters';
import { PMFleetHealthSummary } from './PMFleetHealthSummary';
import { usePMHealthCalculations, TruckHealthStatus } from './usePMHealthCalculations';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

interface PreventiveMaintenanceTabProps {
  onViewTruck: (truckId: string) => void;
}

// Manufacturer display names and schedule types
const MANUFACTURER_SCHEDULE_NAMES: Record<string, string> = {
  'freightliner': 'Freightliner Cascadia Schedule II',
  'western star': 'Western Star M-System',
  'peterbilt': 'Peterbilt PACCAR Normal Duty',
  'kenworth': 'Kenworth PACCAR Normal Duty',
  'international': 'International Class System',
  'volvo': 'Volvo VDS-4.5 Normal Duty',
  'mack': 'Mack EOS-4.5 Normal Duty',
};

// List of supported manufacturers with PM profiles
const SUPPORTED_MANUFACTURERS = ['freightliner', 'western star', 'peterbilt', 'kenworth', 'international', 'volvo', 'mack'];

// Group trucks by manufacturer
function groupTrucksByManufacturer(trucks: TruckWithSchedules[]) {
  const groups: Record<string, TruckWithSchedules[]> = {};
  const otherTrucks: TruckWithSchedules[] = [];

  trucks.forEach(truck => {
    const make = (truck.make || '').toLowerCase();
    if (truck.manufacturer_services.length > 0 && SUPPORTED_MANUFACTURERS.includes(make)) {
      if (!groups[make]) {
        groups[make] = [];
      }
      groups[make].push(truck);
    } else {
      otherTrucks.push(truck);
    }
  });

  return { manufacturerGroups: groups, otherTrucks };
}

interface CollapsibleTableSectionProps {
  title: string;
  overdueCount: number;
  dueSoonCount: number;
  totalCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleTableSection({
  title,
  overdueCount,
  dueSoonCount,
  totalCount,
  defaultOpen = true,
  children,
}: CollapsibleTableSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const hasIssues = overdueCount > 0 || dueSoonCount > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-md border overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between bg-muted/50 px-4 py-2.5 border-b hover:bg-muted/70 transition-colors">
            <div className="flex items-center gap-3">
              <ChevronDown className={cn(
                'h-4 w-4 transition-transform',
                !isOpen && '-rotate-90'
              )} />
              <h3 className="font-medium text-sm">{title}</h3>
              <span className="text-xs text-muted-foreground">({totalCount} trucks)</span>
            </div>
            <div className="flex items-center gap-2">
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                  {overdueCount} overdue
                </span>
              )}
              {dueSoonCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning-foreground dark:text-warning">
                  {dueSoonCount} due soon
                </span>
              )}
              {!hasIssues && totalCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                  All on track
                </span>
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface ManufacturerPMTableProps {
  trucks: TruckWithSchedules[];
  onViewTruck: (truckId: string) => void;
  compactMode: boolean;
}

function ManufacturerPMTable({ trucks, onViewTruck, compactMode }: ManufacturerPMTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = trucks.length > 20;

  const rowVirtualizer = useVirtualizer({
    count: trucks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
    enabled: shouldVirtualize,
  });

  if (trucks.length === 0) return null;

  // Get service columns from first truck's manufacturer services
  const serviceColumns = trucks[0].manufacturer_services.map(s => ({
    code: s.profile.service_code,
    name: s.profile.service_name,
  }));

  const renderRow = (truck: TruckWithSchedules, style?: React.CSSProperties) => {
    const inspectionSchedule = truck.schedules.find(s => s.service_name === '120-Day Inspection');
    const currentOdometer = truck.calculated_odometer || 0;

    return (
      <TableRow 
        key={truck.id}
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => onViewTruck(truck.id)}
        style={style}
      >
        <TableCell className="font-medium">{truck.unit_number}</TableCell>
        <TableCell>{currentOdometer.toLocaleString()} mi</TableCell>
        {truck.manufacturer_services.map((service: ManufacturerService) => (
          <TableCell key={service.profile.id}>
            {compactMode ? (
              <CompactHealthDot
                serviceName={service.profile.service_name}
                currentValue={service.miles_since_service}
                lastPerformedValue={0}
                intervalValue={service.profile.interval_miles || 25000}
                unit="miles"
                baseline={service.baseline}
                description={service.profile.description}
              />
            ) : (
              <HealthBar
                serviceName={service.profile.service_name}
                currentValue={service.miles_since_service}
                lastPerformedValue={0}
                intervalValue={service.profile.interval_miles || 25000}
                unit="miles"
                baseline={service.baseline}
                description={service.profile.description}
              />
            )}
          </TableCell>
        ))}
        <TableCell>
          {inspectionSchedule ? (
            compactMode ? (
              <CompactInspectionDot
                lastInspectionDate={inspectionSchedule.last_performed_date}
                intervalDays={inspectionSchedule.interval_days || 120}
              />
            ) : (
              <InspectionCountdown
                lastInspectionDate={inspectionSchedule.last_performed_date}
                intervalDays={inspectionSchedule.interval_days || 120}
              />
            )
          ) : (
            <span className="text-muted-foreground text-sm">Not scheduled</span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div ref={parentRef} className={shouldVirtualize ? 'max-h-[500px] overflow-auto' : ''}>
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
          {shouldVirtualize ? (
            <tr style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              <td colSpan={serviceColumns.length + 3} style={{ padding: 0 }}>
                <table className="w-full">
                  <tbody>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const truck = trucks[virtualRow.index];
                      return renderRow(truck, {
                        position: 'absolute',
                        top: virtualRow.start,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                      });
                    })}
                  </tbody>
                </table>
              </td>
            </tr>
          ) : (
            trucks.map(truck => renderRow(truck))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface GenericPMTableProps {
  trucks: TruckWithSchedules[];
  onViewTruck: (truckId: string) => void;
  compactMode: boolean;
}

function GenericPMTable({ trucks, onViewTruck, compactMode }: GenericPMTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = trucks.length > 20;

  const rowVirtualizer = useVirtualizer({
    count: trucks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
    enabled: shouldVirtualize,
  });

  if (trucks.length === 0) return null;

  const renderRow = (truck: TruckWithSchedules, style?: React.CSSProperties) => {
    const oilChangeSchedule = truck.schedules.find(s => s.service_name === 'Oil Change');
    const tiresSchedule = truck.schedules.find(s => s.service_name === 'Tire Replacement');
    const inspectionSchedule = truck.schedules.find(s => s.service_name === '120-Day Inspection');

    const currentOdometer = truck.calculated_odometer || 0;
    const oilCurrentValue = (oilChangeSchedule?.last_performed_miles || 0) + (truck.miles_since_oil_change || 0);
    const tireCurrentValue = (tiresSchedule?.last_performed_miles || 0) + (truck.miles_since_tire_replacement || 0);

    return (
      <TableRow 
        key={truck.id}
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => onViewTruck(truck.id)}
        style={style}
      >
        <TableCell className="font-medium">{truck.unit_number}</TableCell>
        <TableCell>{currentOdometer.toLocaleString()} mi</TableCell>
        <TableCell>
          {oilChangeSchedule ? (
            compactMode ? (
              <CompactHealthDot
                serviceName="Oil"
                currentValue={oilCurrentValue}
                lastPerformedValue={oilChangeSchedule.last_performed_miles || 0}
                intervalValue={oilChangeSchedule.interval_miles || 15000}
                unit="miles"
                baseline={truck.oil_change_baseline}
              />
            ) : (
              <HealthBar
                serviceName="Oil"
                currentValue={oilCurrentValue}
                lastPerformedValue={oilChangeSchedule.last_performed_miles || 0}
                intervalValue={oilChangeSchedule.interval_miles || 15000}
                unit="miles"
                baseline={truck.oil_change_baseline}
              />
            )
          ) : (
            <span className="text-muted-foreground text-sm">Not scheduled</span>
          )}
        </TableCell>
        <TableCell>
          {tiresSchedule ? (
            compactMode ? (
              <CompactHealthDot
                serviceName="Tires"
                currentValue={tireCurrentValue}
                lastPerformedValue={tiresSchedule.last_performed_miles || 0}
                intervalValue={tiresSchedule.interval_miles || 80000}
                unit="miles"
                baseline={truck.tire_replacement_baseline}
              />
            ) : (
              <HealthBar
                serviceName="Tires"
                currentValue={tireCurrentValue}
                lastPerformedValue={tiresSchedule.last_performed_miles || 0}
                intervalValue={tiresSchedule.interval_miles || 80000}
                unit="miles"
                baseline={truck.tire_replacement_baseline}
              />
            )
          ) : (
            <span className="text-muted-foreground text-sm">Not scheduled</span>
          )}
        </TableCell>
        <TableCell>
          {inspectionSchedule ? (
            compactMode ? (
              <CompactInspectionDot
                lastInspectionDate={inspectionSchedule.last_performed_date}
                intervalDays={inspectionSchedule.interval_days || 120}
              />
            ) : (
              <InspectionCountdown
                lastInspectionDate={inspectionSchedule.last_performed_date}
                intervalDays={inspectionSchedule.interval_days || 120}
              />
            )
          ) : (
            <span className="text-muted-foreground text-sm">Not scheduled</span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div ref={parentRef} className={shouldVirtualize ? 'max-h-[500px] overflow-auto' : ''}>
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
          {shouldVirtualize ? (
            <tr style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              <td colSpan={5} style={{ padding: 0 }}>
                <table className="w-full">
                  <tbody>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const truck = trucks[virtualRow.index];
                      return renderRow(truck, {
                        position: 'absolute',
                        top: virtualRow.start,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                      });
                    })}
                  </tbody>
                </table>
              </td>
            </tr>
          ) : (
            trucks.map(truck => renderRow(truck))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function PreventiveMaintenanceTab({ onViewTruck }: PreventiveMaintenanceTabProps) {
  const { data: trucks, isLoading } = usePMSchedule();
  
  // Filter state with localStorage persistence
  const [searchQuery, setSearchQuery] = useState(() => 
    localStorage.getItem('pm-search') || ''
  );
  const [statusFilter, setStatusFilter] = useState<HealthStatus>(() => 
    (localStorage.getItem('pm-status-filter') as HealthStatus) || 'all'
  );
  const [manufacturerFilter, setManufacturerFilter] = useState<ManufacturerFilter>(() => 
    (localStorage.getItem('pm-manufacturer-filter') as ManufacturerFilter) || 'all'
  );
  const [compactMode, setCompactMode] = useState(() => 
    localStorage.getItem('pm-compact-mode') === 'true'
  );
  const [hideHealthy, setHideHealthy] = useState(() => 
    localStorage.getItem('pm-hide-healthy') === 'true'
  );

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('pm-search', searchQuery);
  }, [searchQuery]);
  
  useEffect(() => {
    localStorage.setItem('pm-status-filter', statusFilter);
  }, [statusFilter]);
  
  useEffect(() => {
    localStorage.setItem('pm-manufacturer-filter', manufacturerFilter);
  }, [manufacturerFilter]);
  
  useEffect(() => {
    localStorage.setItem('pm-compact-mode', String(compactMode));
  }, [compactMode]);
  
  useEffect(() => {
    localStorage.setItem('pm-hide-healthy', String(hideHealthy));
  }, [hideHealthy]);

  // Debounced search for performance
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
  }, 200);

  // Calculate health for all trucks
  const { truckHealthList, overdueCount, dueSoonCount, onTrackCount } = usePMHealthCalculations(trucks);

  // Apply filters
  const filteredTrucks = useMemo(() => {
    if (!truckHealthList.length) return [];

    return truckHealthList.filter(({ truck, status }) => {
      // Search filter
      if (searchQuery && !truck.unit_number.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const statusMap: Record<HealthStatus, TruckHealthStatus | null> = {
          'all': null,
          'overdue': 'overdue',
          'due-soon': 'due-soon',
          'on-track': 'on-track',
        };
        if (statusMap[statusFilter] && status !== statusMap[statusFilter]) {
          return false;
        }
      }

      // Manufacturer filter
      if (manufacturerFilter !== 'all') {
        const make = (truck.make || '').toLowerCase();
        if (manufacturerFilter === 'freightliner' && make !== 'freightliner') return false;
        if (manufacturerFilter === 'other' && SUPPORTED_MANUFACTURERS.includes(make)) return false;
      }

      // Hide healthy filter
      if (hideHealthy && status === 'on-track') {
        return false;
      }

      return true;
    });
  }, [truckHealthList, searchQuery, statusFilter, manufacturerFilter, hideHealthy]);

  // Group filtered trucks by manufacturer
  const { manufacturerGroups, otherTrucks } = useMemo(() => {
    const trucksOnly = filteredTrucks.map(t => t.truck);
    return groupTrucksByManufacturer(trucksOnly);
  }, [filteredTrucks]);

  // Calculate health counts for each group
  const groupHealthCounts = useMemo(() => {
    const counts: Record<string, { overdueCount: number; dueSoonCount: number }> = {};
    
    // For each manufacturer group
    Object.keys(manufacturerGroups).forEach(make => {
      const groupTrucks = manufacturerGroups[make];
      const health = filteredTrucks.filter(t => 
        (t.truck.make || '').toLowerCase() === make
      );
      counts[make] = {
        overdueCount: health.filter(h => h.status === 'overdue').length,
        dueSoonCount: health.filter(h => h.status === 'due-soon').length,
      };
    });

    // For other trucks
    const otherHealth = filteredTrucks.filter(t => {
      const make = (t.truck.make || '').toLowerCase();
      return !SUPPORTED_MANUFACTURERS.includes(make) || t.truck.manufacturer_services.length === 0;
    });
    counts['other'] = {
      overdueCount: otherHealth.filter(h => h.status === 'overdue').length,
      dueSoonCount: otherHealth.filter(h => h.status === 'due-soon').length,
    };

    return counts;
  }, [filteredTrucks, manufacturerGroups]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
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

  // Sort manufacturers by number of issues (most urgent first)
  const sortedManufacturers = Object.keys(manufacturerGroups).sort((a, b) => {
    const aIssues = (groupHealthCounts[a]?.overdueCount || 0) * 10 + (groupHealthCounts[a]?.dueSoonCount || 0);
    const bIssues = (groupHealthCounts[b]?.overdueCount || 0) * 10 + (groupHealthCounts[b]?.dueSoonCount || 0);
    return bIssues - aIssues;
  });

  return (
    <div className="space-y-4">
      {/* Fleet Health Summary */}
      <PMFleetHealthSummary
        overdueCount={overdueCount}
        dueSoonCount={dueSoonCount}
        onTrackCount={onTrackCount}
        onFilterClick={setStatusFilter}
        activeFilter={statusFilter}
      />

      {/* Filters */}
      <PMScheduleFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        manufacturerFilter={manufacturerFilter}
        onManufacturerFilterChange={setManufacturerFilter}
        compactMode={compactMode}
        onCompactModeChange={setCompactMode}
        hideHealthy={hideHealthy}
        onHideHealthyChange={setHideHealthy}
      />

      {/* Results */}
      {filteredTrucks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
          <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-medium">No matching trucks</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or search query.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Render manufacturer-specific tables */}
          {sortedManufacturers.map(make => {
            const groupTrucks = manufacturerGroups[make];
            const health = groupHealthCounts[make] || { overdueCount: 0, dueSoonCount: 0 };
            const title = MANUFACTURER_SCHEDULE_NAMES[make] || `${make.charAt(0).toUpperCase() + make.slice(1)} PM Schedule`;

            return (
              <CollapsibleTableSection
                key={make}
                title={title}
                overdueCount={health.overdueCount}
                dueSoonCount={health.dueSoonCount}
                totalCount={groupTrucks.length}
                defaultOpen={health.overdueCount > 0 || health.dueSoonCount > 0 || groupTrucks.length <= 10}
              >
                <ManufacturerPMTable 
                  trucks={groupTrucks} 
                  onViewTruck={onViewTruck}
                  compactMode={compactMode}
                />
              </CollapsibleTableSection>
            );
          })}

          {/* Render generic table for other trucks */}
          {otherTrucks.length > 0 && (
            <CollapsibleTableSection
              title="Other Trucks"
              overdueCount={groupHealthCounts['other']?.overdueCount || 0}
              dueSoonCount={groupHealthCounts['other']?.dueSoonCount || 0}
              totalCount={otherTrucks.length}
              defaultOpen={(groupHealthCounts['other']?.overdueCount || 0) > 0 || (groupHealthCounts['other']?.dueSoonCount || 0) > 0 || otherTrucks.length <= 10}
            >
              <GenericPMTable 
                trucks={otherTrucks} 
                onViewTruck={onViewTruck}
                compactMode={compactMode}
              />
            </CollapsibleTableSection>
          )}
        </div>
      )}
    </div>
  );
}