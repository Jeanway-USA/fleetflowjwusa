import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Lock, Loader2, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { usePayrollTaxConfig } from '@/hooks/usePayrollTaxConfig';
import {
  calculateLineHaulBase,
  calculatePayrollTaxes,
} from '@/utils/payCalculations';
import { format, startOfWeek, endOfWeek } from 'date-fns';

type LedgerRow = {
  id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  pay_model: string;
  employment_type: string;
  total_miles: number;
  gross_line_haul: number;
  pass_through_fsc: number;
  gross_taxable_pay: number;
  federal_withholding_override: number | null;
  status: string;
  finalized_at: string | null;
};

export function ActiveBatchTab() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const { data: taxConfig } = usePayrollTaxConfig();

  const today = new Date();
  const [periodStart, setPeriodStart] = useState<string>(
    format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );
  const [periodEnd, setPeriodEnd] = useState<string>(
    format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );

  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ['internal_payroll_ledger', orgId, periodStart, periodEnd],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_payroll_ledger')
        .select('*')
        .eq('org_id', orgId!)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LedgerRow[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers_for_payroll', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, pay_type, employment_type, license_state')
        .eq('org_id', orgId!)
        .eq('status', 'active');
      if (error) throw error;
      return data ?? [];
    },
  });

  const driverMap = useMemo(() => {
    const m = new Map<string, (typeof drivers)[number]>();
    drivers.forEach((d) => m.set(d.id, d));
    return m;
  }, [drivers]);

  const generateBatch = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization');
      const year = new Date(periodStart).getFullYear();
      const yearStart = `${year}-01-01`;

      for (const d of drivers) {
        // Aggregate loads for this driver in the window
        const { data: loads } = await supabase
          .from('fleet_loads')
          .select('gross_revenue, fsc_amount, actual_miles, booked_miles')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .gte('delivery_date', periodStart)
          .lte('delivery_date', periodEnd);

        const gross = (loads ?? []).reduce(
          (s, l) => s + (Number(l.gross_revenue) || 0), 0,
        );
        const fsc = (loads ?? []).reduce(
          (s, l) => s + (Number(l.fsc_amount) || 0), 0,
        );
        const miles = (loads ?? []).reduce(
          (s, l) => s + (Number(l.actual_miles) || Number(l.booked_miles) || 0), 0,
        );
        const payModel = (d.pay_type ?? 'per_mile').toLowerCase();
        const empType = d.employment_type === 'w2_company' ? 'w2' : '1099';

        const grossTaxable = calculateLineHaulBase({
          grossTotal: gross,
          fscAmount: fsc,
          payModel,
        });

        if (gross === 0 && miles === 0) continue; // skip drivers with no activity

        // YTD (from finalized ledgers earlier in year)
        const { data: ytdRows } = await supabase
          .from('internal_payroll_ledger')
          .select('gross_taxable_pay')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .eq('status', 'finalized')
          .gte('period_end', yearStart)
          .lt('period_end', periodStart);
        const ytd = (ytdRows ?? []).reduce(
          (s, r) => s + (Number(r.gross_taxable_pay) || 0), 0,
        );

        // Upsert ledger row (draft)
        const { data: existing } = await supabase
          .from('internal_payroll_ledger')
          .select('id, status')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .maybeSingle();

        if (existing?.status === 'finalized') continue;

        let ledgerId = existing?.id;
        if (ledgerId) {
          await supabase
            .from('internal_payroll_ledger')
            .update({
              pay_model: payModel,
              employment_type: empType,
              total_miles: miles,
              gross_line_haul: gross,
              pass_through_fsc: fsc,
              gross_taxable_pay: grossTaxable,
            })
            .eq('id', ledgerId);
        } else {
          const { data: inserted } = await supabase
            .from('internal_payroll_ledger')
            .insert({
              org_id: orgId,
              driver_id: d.id,
              period_start: periodStart,
              period_end: periodEnd,
              pay_model: payModel,
              employment_type: empType,
              total_miles: miles,
              gross_line_haul: gross,
              pass_through_fsc: fsc,
              gross_taxable_pay: grossTaxable,
              status: 'draft',
            })
            .select('id')
            .single();
          ledgerId = inserted?.id;
        }

        if (!ledgerId || !taxConfig) continue;

        const taxes = calculatePayrollTaxes({
          grossTaxablePay: grossTaxable,
          ytdEarnings: ytd,
          employmentType: empType,
          config: taxConfig,
          federalOverride: 0,
          state: d.license_state,
        });

        await supabase.from('tax_withholding_ledger').upsert(
          {
            org_id: orgId,
            ledger_id: ledgerId,
            ee_social_security: taxes.eeSocialSecurity,
            er_social_security: taxes.erSocialSecurity,
            ee_medicare: taxes.eeMedicare,
            employer_medicare: taxes.employerMedicare,
            federal_income_withholding: taxes.federalIncomeWithholding,
            tx_twc_unemployment: taxes.txTwcUnemployment,
            fl_reemployment: taxes.flReemployment,
          },
          { onConflict: 'ledger_id' },
        );
      }
    },
    onSuccess: () => {
      toast.success('Payroll batch generated');
      qc.invalidateQueries({ queryKey: ['internal_payroll_ledger'] });
      qc.invalidateQueries({ queryKey: ['tax_withholding_ledger'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Failed to generate batch'),
  });

  const ledgerIds = ledgers.map((l) => l.id);
  const { data: withholdings = [] } = useQuery({
    queryKey: ['tax_withholding_ledger', ledgerIds],
    enabled: ledgerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_withholding_ledger')
        .select('*')
        .in('ledger_id', ledgerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const withholdingMap = useMemo(() => {
    const m = new Map<string, (typeof withholdings)[number]>();
    withholdings.forEach((w) => m.set(w.ledger_id, w));
    return m;
  }, [withholdings]);

  const updateFit = useMutation({
    mutationFn: async ({ ledgerId, value }: { ledgerId: string; value: number }) => {
      const row = ledgers.find((l) => l.id === ledgerId);
      if (!row || !taxConfig) return;
      const driver = driverMap.get(row.driver_id);
      const yearStart = `${new Date(row.period_start).getFullYear()}-01-01`;
      const { data: ytdRows } = await supabase
        .from('internal_payroll_ledger')
        .select('gross_taxable_pay')
        .eq('driver_id', row.driver_id)
        .eq('status', 'finalized')
        .gte('period_end', yearStart)
        .lt('period_end', row.period_start);
      const ytd = (ytdRows ?? []).reduce(
        (s, r) => s + (Number(r.gross_taxable_pay) || 0), 0,
      );
      const taxes = calculatePayrollTaxes({
        grossTaxablePay: row.gross_taxable_pay,
        ytdEarnings: ytd,
        employmentType: row.employment_type === 'w2' ? 'w2' : '1099',
        config: taxConfig,
        federalOverride: value,
        state: driver?.license_state,
      });
      await supabase
        .from('internal_payroll_ledger')
        .update({ federal_withholding_override: value })
        .eq('id', ledgerId);
      await supabase.from('tax_withholding_ledger').upsert(
        {
          org_id: orgId!,
          ledger_id: ledgerId,
          ee_social_security: taxes.eeSocialSecurity,
          er_social_security: taxes.erSocialSecurity,
          ee_medicare: taxes.eeMedicare,
          employer_medicare: taxes.employerMedicare,
          federal_income_withholding: taxes.federalIncomeWithholding,
          tx_twc_unemployment: taxes.txTwcUnemployment,
          fl_reemployment: taxes.flReemployment,
        },
        { onConflict: 'ledger_id' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax_withholding_ledger'] });
      qc.invalidateQueries({ queryKey: ['internal_payroll_ledger'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Update failed'),
  });

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle>Active Payroll Batch</CardTitle>
          <CardDescription>
            One draft ledger row per active driver for the selected pay period.
            Regenerating recomputes drafts; finalized rows are never overwritten.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">Period start</Label>
            <Input type="date" value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Period end</Label>
            <Input type="date" value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)} className="h-9" />
          </div>
          <Button onClick={() => generateBatch.mutate()}
            disabled={generateBatch.isPending || !taxConfig}>
            {generateBatch.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <RefreshCw className="h-4 w-4 mr-2" />}
            Generate Batch
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">FSC Pass-Through</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">EE Tax</TableHead>
                <TableHead className="text-right">ER Tax</TableHead>
                <TableHead className="text-right">FIT Override</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={10} className="text-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </TableCell></TableRow>
              )}
              {!isLoading && ledgers.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                  No batch generated for this period yet.
                </TableCell></TableRow>
              )}
              {ledgers.map((r) => {
                const w = withholdingMap.get(r.id);
                const driver = driverMap.get(r.driver_id);
                const name = driver
                  ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim()
                  : r.driver_id.slice(0, 8);
                const eeTax = (w?.ee_social_security ?? 0)
                  + (w?.ee_medicare ?? 0)
                  + (w?.federal_income_withholding ?? 0);
                const erTax = (w?.er_social_security ?? 0)
                  + (w?.employer_medicare ?? 0)
                  + (w?.tx_twc_unemployment ?? 0)
                  + (w?.fl_reemployment ?? 0);
                const net = r.gross_taxable_pay - eeTax + r.pass_through_fsc;
                const locked = r.status === 'finalized';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {r.pay_model} · {r.employment_type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.gross_line_haul)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.pass_through_fsc)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.gross_taxable_pay)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(eeTax)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(erTax)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" step="0.01" min="0"
                        defaultValue={r.federal_withholding_override ?? 0}
                        disabled={locked || r.employment_type !== 'w2'}
                        className="h-8 w-24 text-right"
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (v !== (r.federal_withholding_override ?? 0)) {
                            updateFit.mutate({ ledgerId: r.id, value: v });
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(net)}
                    </TableCell>
                    <TableCell>
                      {locked
                        ? <Badge className="gap-1"><Lock className="h-3 w-3" /> Finalized</Badge>
                        : <Badge variant="secondary">Draft</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
