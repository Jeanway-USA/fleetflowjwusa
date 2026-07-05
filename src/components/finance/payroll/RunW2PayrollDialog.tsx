import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithAuth } from '@/lib/invoke-with-auth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatters';
import { Payroll } from '@gusto/embedded-react-sdk';
import {
  mapSettlementToGustoPayrollInputs,
  summarizeGustoPayrollBatch,
  type GustoEmployeeCompensation,
} from '@/lib/w2-payroll';
import { useGustoStatus } from '@/lib/gusto/useGustoStatus';

interface W2Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employment_type: string | null;
  gusto_employee_id?: string | null;
}

interface RunW2PayrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers: W2Driver[];
  onCompleted?: () => void;
}

export function RunW2PayrollDialog({
  open,
  onOpenChange,
  drivers,
  onCompleted,
}: RunW2PayrollDialogProps) {
  const qc = useQueryClient();
  const w2Drivers = useMemo(
    () => drivers.filter((d) => d.employment_type === 'w2_company'),
    [drivers],
  );

  const [provisioning, setProvisioning] = useState(false);
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGustoStatus(open);

  // Pull latest driver rows so we know which are already synced to Gusto
  const { data: syncedDrivers = [] } = useQuery({
    queryKey: ['drivers_gusto_ids', w2Drivers.map((d) => d.id).join(',')],
    enabled: open && w2Drivers.length > 0,
    queryFn: async () => {
      const ids = w2Drivers.map((d) => d.id);
      const { data } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, gusto_employee_id')
        .in('id', ids);
      return (data ?? []) as Array<W2Driver & { gusto_employee_id: string | null }>;
    },
  });

  // Client-side preview of what we WOULD push to Gusto (uses a nominal $0
  // gross since real amounts get entered by the payroll admin inside Gusto's
  // PayrollFlow). This preview is purely informational.
  const previewInputs: GustoEmployeeCompensation[] = useMemo(() => {
    return syncedDrivers
      .filter((d) => !!d.gusto_employee_id)
      .map((d) =>
        mapSettlementToGustoPayrollInputs(
          {
            gross_pay: 0,
            memo: `Preview for ${d.first_name ?? ''} ${d.last_name ?? ''}`.trim(),
            items: [],
          },
          d.gusto_employee_id as string,
        ),
      );
  }, [syncedDrivers]);

  const previewTotals = useMemo(
    () => summarizeGustoPayrollBatch(previewInputs),
    [previewInputs],
  );

  const missingSyncCount = syncedDrivers.filter((d) => !d.gusto_employee_id).length;
  const provisioned = !!status?.company_uuid;

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      const { error } = await invokeWithAuth('run-w2-payroll', {
        body: { action: 'provision_company', payload: {} },
      });
      if (error) throw error;
      toast.success('Gusto company provisioned');
      await refetchStatus();
      qc.invalidateQueries({ queryKey: ['gusto', 'status'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to provision Gusto company';
      toast.error(msg);
    } finally {
      setProvisioning(false);
    }
  };

  const handleSyncDrivers = async () => {
    const toSync = syncedDrivers.filter((d) => !d.gusto_employee_id);
    if (toSync.length === 0) return;
    toast.info(`Syncing ${toSync.length} driver${toSync.length === 1 ? '' : 's'} to Gusto…`);
    const results = await Promise.allSettled(
      toSync.map((d) =>
        invokeWithAuth('run-w2-payroll', {
          body: { action: 'sync_employee', payload: { driver_id: d.id } },
        }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    qc.invalidateQueries({ queryKey: ['drivers_gusto_ids'] });
    if (failed) toast.error(`${failed} driver(s) failed to sync`);
    else toast.success('Drivers synced to Gusto');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <DialogTitle>Run W-2 Payroll</DialogTitle>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Gusto Embedded · Sandbox
            </Badge>
          </div>
          <DialogDescription>
            Payroll is executed inside Gusto&apos;s white-labeled workspace. The
            preview on the left shows how FleetFlow will map today&apos;s
            settlement data to Gusto&apos;s compensation records.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr]">
          {/* Left: FleetFlow preview + connection state */}
          <aside className="border-r p-4 space-y-4 overflow-y-auto bg-muted/30">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Gusto Connection
              </p>
              {statusLoading ? (
                <div className="flex items-center gap-2 text-sm mt-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                </div>
              ) : provisioned ? (
                <div className="text-sm mt-1">
                  <Badge variant="secondary" className="capitalize">
                    {status?.onboarding_status}
                  </Badge>
                  <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                    {status?.company_uuid}
                  </p>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={handleProvision}
                  disabled={provisioning}
                >
                  {provisioning ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Provisioning…
                    </>
                  ) : (
                    'Provision Gusto company'
                  )}
                </Button>
              )}
            </div>

            {provisioned && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Drivers ({syncedDrivers.length})
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {previewInputs.length} synced · {missingSyncCount} pending
                </p>
                {missingSyncCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={handleSyncDrivers}
                  >
                    Sync {missingSyncCount} to Gusto
                  </Button>
                )}
              </div>
            )}

            <div className="border rounded-md p-3 bg-background">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                FleetFlow preview
              </p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Regular</span>
                  <span className="tabular-nums">{formatCurrency(previewTotals.totalGross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bonus</span>
                  <span className="tabular-nums">{formatCurrency(previewTotals.totalBonus)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reimb.</span>
                  <span className="tabular-nums">
                    {formatCurrency(previewTotals.totalReimbursements)}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Actual amounts are entered inside Gusto&apos;s workspace.
              </p>
            </div>
          </aside>

          {/* Right: Gusto's embedded PayrollFlow */}
          <section className="overflow-y-auto p-4">
            {!provisioned ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Not connected to Gusto yet</AlertTitle>
                <AlertDescription>
                  Provision this organization&apos;s Gusto company from the panel
                  on the left. Once provisioned, the white-labeled Run Payroll
                  workspace will render here.
                </AlertDescription>
              </Alert>
            ) : (
              <Payroll.PayrollFlow
                companyId={status!.company_uuid as string}
                onEvent={(event, data) => {
                  if (event === 'runPayroll/submitted' || event === 'runPayroll/processed') {
                    toast.success('Payroll submitted to Gusto');
                    qc.invalidateQueries({ queryKey: ['driver_payroll'] });
                    onCompleted?.();
                  }
                  if (event === 'runPayroll/processingFailed') {
                    toast.error('Gusto payroll processing failed');
                  }
                  // For debugging in the sandbox:
                  // eslint-disable-next-line no-console
                  console.debug('[Gusto PayrollFlow]', event, data);
                }}
              />
            )}
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <p className="text-xs text-muted-foreground mr-auto">
            {format(new Date(), 'PP')} · {w2Drivers.length} W-2 driver{w2Drivers.length === 1 ? '' : 's'}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
