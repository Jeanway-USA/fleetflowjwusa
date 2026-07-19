import { cn } from '@/lib/utils';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'default';

const statusColors: Record<StatusType, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-destructive/15 text-destructive',
  info: 'bg-primary/15 text-primary',
  default: 'bg-muted text-muted-foreground',
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
  // Credential expiry statuses
  expiring_soon: 'warning',
  expired: 'error',
  valid: 'success',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const safeStatus = status ?? 'unknown';
  const type = statusMap[safeStatus.toLowerCase()] || 'default';
  const displayText = safeStatus.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap',
        statusColors[type],
        className
      )}
    >
      {displayText}
    </span>
  );
}
