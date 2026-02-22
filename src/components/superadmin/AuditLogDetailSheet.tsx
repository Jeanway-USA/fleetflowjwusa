import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { AlertTriangle, Clock, Building2, User, Database, FileText, Hash } from 'lucide-react';

const TABLE_CONTEXT: Record<string, string> = {
  settlements: 'Driver payment settlements',
  drivers: 'Driver records and profiles',
  driver_payroll: 'Driver payroll entries',
  incidents: 'Safety incident reports',
  fleet_loads: 'Load/shipment records',
  trucks: 'Fleet truck records',
  trailers: 'Trailer inventory records',
  expenses: 'Expense entries',
  fuel_purchases: 'IFTA fuel purchase records',
  organizations: 'Organization settings',
  work_orders: 'Maintenance work orders',
  maintenance_logs: 'Service history records',
  crm_contacts: 'CRM contact records',
  agency_loads: 'Agency brokered loads',
  driver_inspections: 'DVIR inspection records',
};

const SENSITIVE_TABLES = ['driver_payroll', 'settlements', 'drivers', 'incidents', 'organizations'];

interface AuditLogDetailSheetProps {
  log: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditLogDetailSheet({ log, open, onOpenChange }: AuditLogDetailSheetProps) {
  if (!log) return null;

  const isSensitive = SENSITIVE_TABLES.includes(log.table_name);
  const isDelete = log.action === 'DELETE';
  const actionVariant = isDelete ? 'destructive' : log.action === 'INSERT' ? 'default' : 'secondary';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            {log.action} on {log.table_name}
          </SheetTitle>
          <SheetDescription>Audit log entry details</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Warning for sensitive destructive actions */}
          {isDelete && isSensitive && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                Destructive action on a sensitive table. Review carefully.
              </p>
            </div>
          )}

          {/* Action */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Action</span>
            <Badge variant={actionVariant}>{log.action}</Badge>
          </div>

          {/* Table */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Table</span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <FileText className="h-3.5 w-3.5" />
              {log.table_name}
            </span>
          </div>

          {/* Table context */}
          {TABLE_CONTEXT[log.table_name] && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Context</span>
              <span className="text-sm text-muted-foreground italic">
                {TABLE_CONTEXT[log.table_name]}
              </span>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Timestamp</span>
            <span className="flex items-center gap-1.5 text-sm">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}
            </span>
          </div>

          {/* Organization */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Organization</span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Building2 className="h-3.5 w-3.5" />
              {log.org_name || log.org_id?.slice(0, 8) + '…' || '—'}
            </span>
          </div>

          <Separator />

          {/* User ID */}
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> User ID
            </span>
            <p className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-all">
              {log.user_id || '—'}
            </p>
          </div>

          {/* Record ID */}
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Record ID
            </span>
            <p className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-all">
              {log.record_id || '—'}
            </p>
          </div>

          <Separator />

          {/* Details JSON */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Details</span>
            {log.details ? (
              <pre className="text-xs font-mono bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">No details recorded</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
