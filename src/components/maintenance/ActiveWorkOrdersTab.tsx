import { useState } from 'react';
import { useActiveWorkOrders, useUpdateWorkOrderStatus, WorkOrder } from '@/hooks/useMaintenanceData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { CheckCircle, Wrench, Package, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompleteJobModal } from './CompleteJobModal';

interface ActiveWorkOrdersTabProps {
  onViewTruck: (truckId: string) => void;
}

export function ActiveWorkOrdersTab({ onViewTruck }: ActiveWorkOrdersTabProps) {
  const { data: workOrders, isLoading } = useActiveWorkOrders();
  const updateStatus = useUpdateWorkOrderStatus();
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Open</Badge>;
      case 'parts_ordered':
        return <Badge className="bg-amber-500 hover:bg-amber-600 gap-1"><Package className="h-3 w-3" />Parts Ordered</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500 hover:bg-blue-600 gap-1"><Wrench className="h-3 w-3" />In Progress</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getServiceTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      pm: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      repair: 'bg-red-100 text-red-800 border-red-300',
      tire: 'bg-slate-100 text-slate-800 border-slate-300',
      inspection: 'bg-blue-100 text-blue-800 border-blue-300',
    };
    return (
      <Badge variant="outline" className={cn('capitalize', colors[type] || '')}>
        {type}
      </Badge>
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
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!workOrders?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No Active Work Orders</h3>
        <p className="text-sm text-muted-foreground">
          All trucks are currently available. Create a new work order to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit #</TableHead>
              <TableHead>Service Type</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Entry Date</TableHead>
              <TableHead>Est. Completion</TableHead>
              <TableHead>Cost Est.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workOrders.map(wo => (
              <TableRow 
                key={wo.id}
                className={cn(
                  'cursor-pointer',
                  wo.is_reimbursable && 'bg-amber-50/50 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
                )}
                onClick={() => onViewTruck(wo.truck_id)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {wo.trucks?.unit_number || 'Unknown'}
                    {wo.is_reimbursable && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1">
                        <DollarSign className="h-2.5 w-2.5 mr-0.5" />
                        Reimbursable
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{getServiceTypeBadge(wo.service_type)}</TableCell>
                <TableCell>{wo.vendor || '-'}</TableCell>
                <TableCell>{format(new Date(wo.entry_date), 'MMM d, yyyy')}</TableCell>
                <TableCell>
                  {wo.estimated_completion 
                    ? format(new Date(wo.estimated_completion), 'MMM d, yyyy')
                    : '-'}
                </TableCell>
                <TableCell>
                  {wo.cost_estimate 
                    ? `$${wo.cost_estimate.toLocaleString()}`
                    : '-'}
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
                  <Button 
                    size="sm" 
                    className="gap-1"
                    onClick={() => handleCompleteClick(wo)}
                  >
                    <CheckCircle className="h-3 w-3" />
                    Complete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CompleteJobModal
        workOrder={selectedWorkOrder}
        open={completeModalOpen}
        onOpenChange={setCompleteModalOpen}
      />
    </>
  );
}
