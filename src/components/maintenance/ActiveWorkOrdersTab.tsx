import { useState, useMemo, useEffect } from 'react';
import { useActiveWorkOrders, useUpdateWorkOrderStatus, WorkOrder } from '@/hooks/useMaintenanceData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { CheckCircle, Wrench, Package, Clock, DollarSign, Search, Filter, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompleteJobModal } from './CompleteJobModal';
import { DriverFaultReportsPanel } from './DriverFaultReportsPanel';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

interface ActiveWorkOrdersTabProps {
  onViewTruck: (truckId: string) => void;
}

type StatusFilter = 'all' | 'open' | 'parts_ordered' | 'in_progress';
type ServiceTypeFilter = 'all' | 'pm' | 'repair' | 'tire' | 'inspection' | 'other' | 'M1' | 'PM_A' | 'M2' | 'M3';

const SERVICE_TYPE_COLORS: Record<string, string> = {
  M1: 'bg-primary/10 text-foreground border-primary/40 dark:bg-primary/10 dark:text-primary dark:border-primary/40',
  PM_A: 'bg-success/15 text-success border-success/40 dark:bg-success/15 dark:text-success dark:border-success/40',
  M2: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
  M3: 'bg-warning/15 text-foreground border-warning/50 dark:bg-warning/15 dark:text-warning dark:border-warning/50',
  pm: 'bg-success/15 text-success border-success/40 dark:bg-success/15 dark:text-success dark:border-success/40',
  repair: 'bg-destructive/10 text-destructive border-destructive/40 dark:bg-destructive/10 dark:text-destructive dark:border-destructive/40',
  tire: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700',
  inspection: 'bg-primary/10 text-foreground border-primary/40 dark:bg-primary/10 dark:text-primary dark:border-primary/40',
  other: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700',
};

const getServiceTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    M1: 'M1',
    PM_A: 'PM A',
    M2: 'M2',
    M3: 'M3',
    pm: 'PM',
    repair: 'Repair',
    tire: 'Tire',
    inspection: '120-Day',
    other: 'Other',
  };
  return labels[type] || type;
};

const statusLabels: Record<StatusFilter, string> = {
  all: 'All Statuses',
  open: 'Open',
  parts_ordered: 'Parts Ordered',
  in_progress: 'In Progress',
};

const serviceTypeLabels: Record<ServiceTypeFilter, string> = {
  all: 'All Service Types',
  pm: 'Preventive Maintenance',
  repair: 'Repair',
  tire: 'Tire',
  inspection: 'Inspection',
  other: 'Other',
  M1: 'M1',
  PM_A: 'PM A',
  M2: 'M2',
  M3: 'M3',
};

export function ActiveWorkOrdersTab({ onViewTruck }: ActiveWorkOrdersTabProps) {
  const { data: workOrders, isLoading } = useActiveWorkOrders();
  const updateStatus = useUpdateWorkOrderStatus();
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);

  // Filter state with localStorage persistence
  const [searchInput, setSearchInput] = useState(() => localStorage.getItem('wo-search') || '');
  const [searchQuery, setSearchQuery] = useState(searchInput);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (localStorage.getItem('wo-status-filter') as StatusFilter) || 'all'
  );
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>(
    () => (localStorage.getItem('wo-service-filter') as ServiceTypeFilter) || 'all'
  );

  useEffect(() => { localStorage.setItem('wo-search', searchQuery); }, [searchQuery]);
  useEffect(() => { localStorage.setItem('wo-status-filter', statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem('wo-service-filter', serviceTypeFilter); }, [serviceTypeFilter]);

  const debouncedSearch = useDebouncedCallback((value: string) => setSearchQuery(value), 200);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearchInput(v);
    debouncedSearch(v);
  };

  // Compute summary counts (unfiltered)
  const summary = useMemo(() => {
    const list = workOrders || [];
    return {
      openCount: list.filter(w => w.status === 'open').length,
      partsCount: list.filter(w => w.status === 'parts_ordered').length,
      inProgressCount: list.filter(w => w.status === 'in_progress').length,
      total: list.length,
      totalCostEst: list.reduce((sum, w) => sum + (w.cost_estimate || 0), 0),
    };
  }, [workOrders]);

  // Apply filters
  const filteredWorkOrders = useMemo(() => {
    if (!workOrders) return [];
    const q = searchQuery.trim().toLowerCase();
    return workOrders.filter(wo => {
      if (statusFilter !== 'all' && wo.status !== statusFilter) return false;
      if (serviceTypeFilter !== 'all') {
        const types = wo.service_types && wo.service_types.length > 0
          ? wo.service_types
          : wo.service_type ? [wo.service_type] : [];
        if (!types.includes(serviceTypeFilter)) return false;
      }
      if (q) {
        const haystack = [
          wo.trucks?.unit_number || '',
          wo.vendor || '',
          wo.description || '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [workOrders, searchQuery, statusFilter, serviceTypeFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Open</Badge>;
      case 'parts_ordered':
        return <Badge className="bg-warning hover:bg-warning gap-1"><Package className="h-3 w-3" />Parts Ordered</Badge>;
      case 'in_progress':
        return <Badge className="bg-primary hover:bg-primary gap-1"><Wrench className="h-3 w-3" />In Progress</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderServiceTypes = (wo: WorkOrder) => {
    const types = wo.service_types && wo.service_types.length > 0
      ? wo.service_types
      : wo.service_type ? [wo.service_type] : [];
    if (types.length === 0) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {types.map((type, index) => (
          <Badge
            key={`${type}-${index}`}
            variant="outline"
            className={cn('text-xs', SERVICE_TYPE_COLORS[type] || SERVICE_TYPE_COLORS.other)}
          >
            {getServiceTypeLabel(type)}
          </Badge>
        ))}
      </div>
    );
  };

  const handleStatusChange = (workOrderId: string, newStatus: string) => {
    updateStatus.mutate({ id: workOrderId, status: newStatus });
  };

  const handleCompleteClick = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setCompleteModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-10 w-full max-w-md" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (!workOrders?.length) {
    return (
      <div className="space-y-4">
        <DriverFaultReportsPanel onViewTruck={onViewTruck} />
        <div className="rounded-lg border bg-card px-4 py-3">
          <h3 className="text-[15px] font-semibold">No Active Work Orders</h3>
          <p className="text-sm text-muted-foreground">
            All trucks are currently available. Create a new work order to get started.
          </p>
        </div>
      </div>
    );
  }


  return (
    <>
      <div className="space-y-4">
        {/* Incoming driver-submitted fault reports */}
        <DriverFaultReportsPanel onViewTruck={onViewTruck} />

        {/* Summary strip — mirrors PMFleetHealthSummary */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
          <span className="text-sm font-medium text-muted-foreground mr-2">
            Active Work Orders
          </span>

          <button
            onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              'hover:bg-slate-200 dark:hover:bg-slate-800/50',
              statusFilter === 'open'
                ? 'bg-slate-200 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                : 'text-slate-600 dark:text-slate-400'
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>{summary.openCount} Open</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <button
            onClick={() => setStatusFilter(statusFilter === 'parts_ordered' ? 'all' : 'parts_ordered')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              'hover:bg-warning/15 dark:hover:bg-warning/15',
              statusFilter === 'parts_ordered'
                ? 'bg-warning/15 dark:bg-warning/15 text-foreground dark:text-warning'
                : 'text-warning dark:text-warning'
            )}
          >
            <Package className="h-3.5 w-3.5" />
            <span>{summary.partsCount} Parts Ordered</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <button
            onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              'hover:bg-primary/10 dark:hover:bg-primary/10',
              statusFilter === 'in_progress'
                ? 'bg-primary/10 dark:bg-primary/10 text-foreground dark:text-primary'
                : 'text-primary dark:text-primary'
            )}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>{summary.inProgressCount} In Progress</span>
          </button>

          <div className="ml-auto text-xs text-muted-foreground">
            {summary.total} active · ${summary.totalCostEst.toLocaleString()} est.
          </div>
        </div>

        {/* Filters row — mirrors PMScheduleFilters */}
        <div className="flex flex-wrap items-center gap-3 pb-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search unit, vendor, description..."
              value={searchInput}
              onChange={handleSearchChange}
              className="pl-10 sm:pl-10"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                {statusLabels[statusFilter]}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <DropdownMenuRadioItem value="all">All Statuses</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="open">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Open
                  </span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="parts_ordered">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-warning" />
                    Parts Ordered
                  </span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="in_progress">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    In Progress
                  </span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {serviceTypeLabels[serviceTypeFilter]}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={serviceTypeFilter}
                onValueChange={(v) => setServiceTypeFilter(v as ServiceTypeFilter)}
              >
                <DropdownMenuRadioItem value="all">All Service Types</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="M1">M1</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="PM_A">PM A</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="M2">M2</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="M3">M3</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="pm">Preventive Maintenance</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="repair">Repair</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="tire">Tire</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="inspection">Inspection</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="other">Other</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Data container */}
        {filteredWorkOrders.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-3">
            <h3 className="text-[15px] font-semibold">No matching work orders</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search query.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit #</TableHead>
                  <TableHead>Service Types</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Entry Date</TableHead>
                  <TableHead>Est. Completion</TableHead>
                  <TableHead>Cost Est.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkOrders.map(wo => (
                  <TableRow
                    key={wo.id}
                    className={cn(
                      'cursor-pointer',
                      wo.is_reimbursable && 'bg-warning/10 hover:bg-warning/15 dark:bg-warning/15 dark:hover:bg-warning/15'
                    )}
                    onClick={() => onViewTruck(wo.truck_id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {wo.trucks?.unit_number || 'Unknown'}
                        {wo.is_reimbursable && (
                          <Badge className="bg-warning/15 text-foreground border-warning/50 text-[10px] px-1">
                            <DollarSign className="h-2.5 w-2.5 mr-0.5" />
                            Reimbursable
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{renderServiceTypes(wo)}</TableCell>
                    <TableCell>{wo.vendor || '-'}</TableCell>
                    <TableCell>{format(new Date(wo.entry_date + 'T00:00:00'), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      {wo.estimated_completion
                        ? format(new Date(wo.estimated_completion + 'T00:00:00'), 'MMM d, yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {wo.cost_estimate ? `$${wo.cost_estimate.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Select
                        value={wo.status}
                        onValueChange={(value) => handleStatusChange(wo.id, value)}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" /> Open
                            </div>
                          </SelectItem>
                          <SelectItem value="parts_ordered">
                            <div className="flex items-center gap-2">
                              <Package className="h-3 w-3" /> Parts Ordered
                            </div>
                          </SelectItem>
                          <SelectItem value="in_progress">
                            <div className="flex items-center gap-2">
                              <Wrench className="h-3 w-3" /> In Progress
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <Button size="sm" className="gap-1" onClick={() => handleCompleteClick(wo)}>
                        <CheckCircle className="h-3 w-3" />
                        Complete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CompleteJobModal
        workOrder={selectedWorkOrder}
        open={completeModalOpen}
        onOpenChange={setCompleteModalOpen}
      />
    </>
  );
}
