import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Receipt, AlertCircle } from 'lucide-react';
import { EmployeeManagement } from '@gusto/embedded-react-sdk';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  /** Unused now — retained for source compatibility with callers. */
  payType?: string | null;
  /** Unused now — retained for source compatibility with callers. */
  payRate?: number | null;
}

export function MyPaystubsDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
}: Props) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!open) setHasError(false);
  }, [open]);

  const { data: driverRow, isLoading } = useQuery({
    queryKey: ['driver_gusto_id', driverId],
    enabled: open && !!driverId,
    queryFn: async () => {
      const { data } = await supabase
        .from('drivers')
        .select('id, gusto_employee_id')
        .eq('id', driverId)
        .maybeSingle();
      return data as { id: string; gusto_employee_id: string | null } | null;
    },
  });

  const gustoEmployeeId = driverRow?.gusto_employee_id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[92vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> My Paystubs
          </DialogTitle>
          <DialogDescription>
            Paystubs are powered by Gusto Embedded Payroll for {driverName}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !gustoEmployeeId ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Payroll not yet activated for your account</AlertTitle>
              <AlertDescription>
                Your employer hasn&apos;t completed your Gusto onboarding yet.
                Once they sync your driver profile to Gusto, your paystubs will
                appear here.
              </AlertDescription>
            </Alert>
          ) : hasError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn&apos;t load paystubs</AlertTitle>
              <AlertDescription>
                Please try again in a moment. If the problem persists, contact
                your payroll administrator.
              </AlertDescription>
            </Alert>
          ) : (
            <EmployeeManagement.PaystubsCard
              employeeId={gustoEmployeeId}
              onEvent={(event, data) => {
                // eslint-disable-next-line no-console
                console.debug('[Gusto PaystubsCard]', event, data);
                if (typeof event === 'string' && event.toLowerCase().includes('error')) {
                  setHasError(true);
                }
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
