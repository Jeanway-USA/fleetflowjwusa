import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'default';

const statusColors: Record<StatusType, string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-primary/10 text-primary border-primary/20',
  default: 'bg-muted text-muted-foreground border-border',
};

const statusMap: Record<string, StatusType> = {
  // Truck statuses
  active: 'success',
  down: 'error',
  out_of_service: 'warning',
  // Driver statuses
  inactive: 'warning',
  suspended: 'error',
  // Load statuses
  pending: 'default',
  assigned: 'info',
  booked: 'info',
  in_transit: 'warning',
  delivered: 'success',
  cancelled: 'error',
  // Payroll statuses
  approved: 'info',
  paid: 'success',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const type = statusMap[status.toLowerCase()] || 'default';
  const displayText = status.replace(/_/g, ' ');
  
  return (
    <Badge 
      variant="outline" 
      className={cn(statusColors[type], 'capitalize font-medium', className)}
    >
      {displayText}
    </Badge>
  );
}
