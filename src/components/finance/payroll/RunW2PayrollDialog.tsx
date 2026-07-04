import { useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  calculateW2Payroll,
  DEFAULT_W2_GROSS,
  EMPTY_YTD,
  type PayrollSettings,
  type W4Info,
} from '@/lib/w2-payroll';
import { downloadW2PayStub } from '@/lib/pdf/generateW2PayStubPdf';

interface W2Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employment_type: string | null;
  tax_state?: string | null;
}

interface StateConfigRow {
  state_code: string;
  suta_rate: number;
  suta_wage_base: number;
  has_state_income_tax: boolean;
  sit_rate: number;
}

interface RunW2PayrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers: W2Driver[];
  onCompleted?: () => void;
}

interface Row {
  driver_id: string;
  gross_pay: number;
  filing_status: string;
  extra_withholding: number;
  dependents_amount: number;
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

  const today = new Date();
  const [periodEnd, setPeriodEnd] = useState(format(today, 'yyyy-MM-dd'));
  const [periodStart, setPeriodStart] = useState(
    format(new Date(today.getTime() - 6 * 86400000), 'yyyy-MM-dd'),
  );
  const [paymentDate, setPaymentDate] = useState(format(today, 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [running, setRunning] = useState(false);

  const { data: settings } = useQuery<PayrollSettings | null>({
    queryKey: ['payroll_settings'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('payroll_settings').select('*').maybeSingle();
      return data as unknown as PayrollSettings | null;
    },
  });

  const { data: w4s = [] } = useQuery({
    queryKey: ['driver_w4_info_all'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('driver_w4_info')
        .select('driver_id, filing_status, extra_withholding, dependents_amount');
      return data ?? [];
    },
  });

  // Initialize rows when dialog opens
  useEffect(() => {
    if (!open) return;
    const w4Map = new Map<string, any>();
    (w4s ?? []).forEach((w) => w4Map.set(w.driver_id, w));
    const next: Record<string, Row> = {};
    w2Drivers.forEach((d) => {
      const w4 = w4Map.get(d.id);
      next[d.id] = {
        driver_id: d.id,
        gross_pay: DEFAULT_W2_GROSS,
        filing_status: w4?.filing_status ?? 'single',
        extra_withholding: Number(w4?.extra_withholding ?? 0),
        dependents_amount: Number(w4?.dependents_amount ?? 0),
      };
    });
    setRows(next);
  }, [open, w2Drivers, w4s]);

  const rowList = Object.values(rows);
  const previews = useMemo(() => {
    if (!settings) return [];
    return rowList.map((r) => {
      const w4: W4Info = {
        filing_status: r.filing_status as any,
        extra_withholding: r.extra_withholding,
        dependents_amount: r.dependents_amount,
      };
      return {
        row: r,
        b: calculateW2Payroll({ grossPay: r.gross_pay, settings, w4, ytd: EMPTY_YTD }),
      };
    });
  }, [rowList, settings]);

  const totals = useMemo(() => {
    const acc = {
      gross: 0,
      fit: 0,
      ss: 0,
      med: 0,
      addlMed: 0,
      net: 0,
      empFica: 0,
      suta: 0,
    };
    previews.forEach(({ b }) => {
      acc.gross += b.grossPay;
      acc.fit += b.federalIncomeTax;
      acc.ss += b.socialSecurityTax;
      acc.med += b.medicareTax;
      acc.addlMed += b.additionalMedicareTax;
      acc.net += b.netPay;
      acc.empFica += b.employerFicaTotal;
      acc.suta += b.flSutaTax;
    });
    return acc;
  }, [previews]);

  const employerLiability = totals.empFica + totals.suta;

  const run = async () => {
    if (rowList.length === 0) return;
    setRunning(true);
    try {
      const { data, error } = await invokeWithAuth<{
        results: Array<{ driver_id: string; payroll_id?: string; error?: string }>;
      }>('run-w2-payroll', {
        body: {
          period_start: periodStart,
          period_end: periodEnd,
          payment_date: paymentDate,
          drivers: rowList.map((r) => ({ driver_id: r.driver_id, gross_pay: r.gross_pay })),
        },
      });
      if (error) throw error;
      const results = data?.results ?? [];
      const errs = results.filter((r) => r.error);
      const okIds = results.filter((r) => r.payroll_id).map((r) => r.payroll_id!);

      // Generate + upload stub PDFs in the background
      await Promise.all(okIds.map((id) => downloadW2PayStub(id).catch(() => null)));

      qc.invalidateQueries({ queryKey: ['driver_payroll'] });
      qc.invalidateQueries({ queryKey: ['driver_payroll_w2'] });
      if (errs.length) {
        toast.error(`${okIds.length} run · ${errs.length} failed: ${errs[0].error}`);
      } else {
        toast.success(`W-2 payroll run for ${okIds.length} driver${okIds.length === 1 ? '' : 's'}`);
      }
      onOpenChange(false);
      onCompleted?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to run W-2 payroll');
    } finally {
      setRunning(false);
    }
  };

  const nameOf = (id: string) => {
    const d = w2Drivers.find((x) => x.id === id);
    return d ? `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() : id;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Run W-2 Payroll</DialogTitle>
          <DialogDescription>
            2026 IRS Percentage Method (Pub 15-T) + 6.2% Social Security, 1.45% Medicare, and Florida
            Reemployment Tax (SUTA). Employer FICA match is accrued but does not reduce net pay.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="w2-ps">Period Start</Label>
              <Input id="w2-ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="w2-pe">Period End</Label>
              <Input id="w2-pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="w2-pd">Payment Date</Label>
              <Input id="w2-pd" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>

          {w2Drivers.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-md p-6 text-center">
              No W-2 drivers found. Set a driver's Employment Type to "W-2 Company Driver" to run payroll here.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Driver</th>
                    <th className="text-right px-3 py-2 w-28">Gross</th>
                    <th className="text-right px-3 py-2 w-24">FIT</th>
                    <th className="text-right px-3 py-2 w-24">SS 6.2%</th>
                    <th className="text-right px-3 py-2 w-24">Medicare</th>
                    <th className="text-right px-3 py-2 w-28">Emp FICA</th>
                    <th className="text-right px-3 py-2 w-24">FL SUTA</th>
                    <th className="text-right px-3 py-2 w-28 bg-primary/5">Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map(({ row, b }) => (
                    <tr key={row.driver_id} className="border-t">
                      <td className="px-3 py-2 font-medium">{nameOf(row.driver_id)}</td>
                      <td className="px-3 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.gross_pay}
                          onChange={(e) =>
                            setRows((prev) => ({
                              ...prev,
                              [row.driver_id]: { ...prev[row.driver_id], gross_pay: Number(e.target.value) },
                            }))
                          }
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(b.federalIncomeTax)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(b.socialSecurityTax)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(b.medicareTax + b.additionalMedicareTax)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(b.employerFicaTotal)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(b.flSutaTax)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold bg-primary/5">
                        {formatCurrency(b.netPay)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 bg-muted/40 font-medium">
                  <tr>
                    <td className="px-3 py-2">Totals ({previews.length})</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.fit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.ss)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(totals.med + totals.addlMed)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.empFica)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.suta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-primary">{formatCurrency(totals.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-md p-3 bg-muted/30">
              <div className="text-xs uppercase text-muted-foreground">Total Employee Withholding</div>
              <div className="text-lg font-semibold">
                {formatCurrency(totals.fit + totals.ss + totals.med + totals.addlMed)}
              </div>
            </div>
            <div className="border rounded-md p-3 bg-amber-50 dark:bg-amber-950/20">
              <div className="text-xs uppercase text-amber-900 dark:text-amber-200">Employer Tax Liability</div>
              <div className="text-lg font-semibold text-amber-900 dark:text-amber-200">
                {formatCurrency(employerLiability)}
              </div>
              <div className="text-[10px] text-amber-800 dark:text-amber-300">
                FICA match ({formatCurrency(totals.empFica)}) + FL SUTA ({formatCurrency(totals.suta)})
              </div>
            </div>
            <div className="border rounded-md p-3 bg-primary/5">
              <div className="text-xs uppercase text-muted-foreground">Total Net Pay</div>
              <div className="text-lg font-semibold text-primary">{formatCurrency(totals.net)}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={run} disabled={running || previews.length === 0}>
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…
              </>
            ) : (
              <>Run Payroll ({previews.length})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
