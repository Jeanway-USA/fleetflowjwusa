import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Check, Wrench, ChevronDown, ChevronUp, Loader2, Truck, MessageSquare, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useDriverFaultReports,
  useAcknowledgeFaultReport,
  useConvertFaultReportToWorkOrder,
  useDeleteFaultReport,
  type DriverFaultReport,
} from '@/hooks/useDriverFaultReports';
import { MaintenanceThread } from './MaintenanceThread';

interface DriverFaultReportsPanelProps {
  onViewTruck: (truckId: string) => void;
}

const PRIORITY_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  critical: {
    badge: 'bg-destructive/15 text-destructive border-destructive/40',
    dot: 'bg-destructive',
    label: 'Critical',
  },
  high: {
    badge: 'bg-warning/15 text-foreground border-warning/50 dark:bg-warning/15 dark:text-warning dark:border-warning/50',
    dot: 'bg-warning',
    label: 'High',
  },
  medium: {
    badge: 'bg-primary/10 text-foreground border-primary/40 dark:bg-primary/10 dark:text-primary dark:border-primary/40',
    dot: 'bg-primary',
    label: 'Medium',
  },
  low: {
    badge: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground',
    label: 'Low',
  },
};

const ISSUE_LABEL: Record<string, string> = {
  tire: 'Tire',
  brake: 'Brake',
  engine: 'Engine',
  electrical: 'Electrical',
  lights: 'Lights',
  trailer: 'Trailer',
  other: 'Other',
};

function DriverName(r: DriverFaultReport) {
  const f = r.drivers?.first_name ?? '';
  const l = r.drivers?.last_name ?? '';
  const name = `${f} ${l}`.trim();
  return name || 'Unknown driver';
}

function ReportRow({ report, onViewTruck }: { report: DriverFaultReport; onViewTruck: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const ack = useAcknowledgeFaultReport();
  const convert = useConvertFaultReportToWorkOrder();
  const del = useDeleteFaultReport();
  const style = PRIORITY_STYLES[report.priority] ?? PRIORITY_STYLES.medium;
  const issueLabel = ISSUE_LABEL[report.issue_type] ?? report.issue_type;
  const acknowledged = report.status === 'acknowledged';
  const linkedToWO = report.status === 'in_progress';

  const handleConvert = () => {
    convert.mutate(report, {
      onSuccess: () => toast.success('Work order created from driver report'),
      onError: (e: any) => toast.error('Failed to create work order: ' + (e?.message ?? 'Unknown error')),
    });
  };

  const handleAck = () => {
    ack.mutate(report.id, {
      onSuccess: () => toast.success('Report acknowledged'),
      onError: (e: any) => toast.error('Failed to acknowledge: ' + (e?.message ?? 'Unknown error')),
    });
  };

  return (
    <div className="p-3 sm:p-4 hover:bg-muted/30 transition-colors">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', style.dot)} aria-hidden />

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => onViewTruck(report.truck_id)}
              className="inline-flex items-center gap-1 font-semibold hover:underline"
            >
              <Truck className="h-3.5 w-3.5" />
              Unit #{report.trucks?.unit_number ?? '?'}
            </button>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground">{DriverName(report)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', style.badge)}>
              {style.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-primary/40 text-primary bg-primary/5">
              Driver Submitted
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {issueLabel}
            </Badge>
            {acknowledged && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                Acknowledged
              </Badge>
            )}
            {linkedToWO && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-success/40 text-success dark:text-success bg-success/10">
                Linked WO
              </Badge>
            )}
          </div>

          <p
            className={cn(
              'text-sm text-foreground/90 whitespace-pre-wrap',
              !expanded && 'line-clamp-2'
            )}
          >
            {report.description}
          </p>
          {report.description.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 shrink-0 ml-auto">
          <Button
            size="sm"
            variant={threadOpen ? 'secondary' : 'outline'}
            onClick={() => setThreadOpen((v) => !v)}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {threadOpen ? 'Hide Chat' : 'Open Chat'}
          </Button>
          {!linkedToWO && (
            <Button size="sm" onClick={handleConvert} disabled={convert.isPending} className="gap-1.5">
              {convert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
              Convert to Work Order
            </Button>
          )}
          {!acknowledged && !linkedToWO && (
            <Button size="sm" variant="ghost" onClick={handleAck} disabled={ack.isPending} className="gap-1.5">
              {ack.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Acknowledge
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={del.isPending}
                aria-label="Delete report"
              >
                {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete driver fault report?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the report from the panel and the driver's history. Any linked work order will remain. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    del.mutate(report.id, {
                      onSuccess: () => toast.success('Report deleted'),
                      onError: (e: any) => toast.error('Failed to delete: ' + (e?.message ?? 'Unknown error')),
                    })
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {threadOpen && (
        <div className="mt-3 pl-5">
          <MaintenanceThread requestId={report.id} viewerRole="maintenance" showRecommendations />
        </div>
      )}
    </div>
  );
}

export function DriverFaultReportsPanel({ onViewTruck }: DriverFaultReportsPanelProps) {
  const { data: reports, isLoading } = useDriverFaultReports();

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b">
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (!reports || reports.length === 0) return null;

  const hasCritical = reports.some((r) => r.priority === 'critical');
  const hasHigh = reports.some((r) => r.priority === 'high');
  const submittedCount = reports.filter((r) => r.status === 'submitted').length;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card overflow-hidden',
        // Red pen around the whole panel only when something is critical.
        hasCritical ? 'border-destructive/60' : hasHigh ? 'border-warning/60' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-muted/30">
        <AlertTriangle
          className={cn(
            'h-4 w-4',
            hasCritical ? 'text-destructive' : hasHigh ? 'text-warning' : 'text-primary'
          )}
        />
        <h3 className="text-sm font-semibold">Incoming Driver Fault Reports</h3>
        <Badge variant="secondary" className="text-xs">
          {reports.length} active
        </Badge>
        {submittedCount > 0 && (
          <Badge variant="outline" className="text-xs border-primary/40 text-primary">
            {submittedCount} new
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Submitted via Driver Dashboard
        </span>
      </div>
      <div className="divide-y">
        {reports.map((r) => (
          <ReportRow key={r.id} report={r} onViewTruck={onViewTruck} />
        ))}
      </div>
    </div>
  );
}
