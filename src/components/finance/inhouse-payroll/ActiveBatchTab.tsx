import { useEffect, useMemo, useState } from 'react';
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
import { Lock, Loader2, RefreshCw, Save, Undo2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { usePayrollTaxConfig } from '@/hooks/usePayrollTaxConfig';
import {
  calculateGrossTaxablePay,
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
  base_salary: number;
  bonus_pay: number;
  holiday_pay: number;
  gross_taxable_pay: number;
  federal_withholding_override: number | null;
  status: string;
};

type RowEdit = { bonus: number; holiday: number; fit: number };

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
      return (data ?? []) as unknown as LedgerRow[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers_for_payroll', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, pay_type, employment_type, license_state, base_salary_per_period')
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
      if (!orgId || !taxConfig) throw new Error('Missing config');
      const year = new Date(periodStart).getFullYear();
      const yearStart = `${year}-01-01`;

      for (const d of drivers) {
        const base = Number((d as { base_salary_per_period?: number }).base_salary_per_period) || 0;
        const empType = d.employment_type === 'w2_company' ? 'w2' : '1099';

        const { data: existing } = await supabase
          .from('internal_payroll_ledger')
          .select('id, status, bonus_pay, holiday_pay')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .maybeSingle();

        if (existing?.status === 'finalized') continue;
        // skip drivers with no base and no existing draft row
        if (base === 0 && !existing) continue;

        const bonus = Number((existing as { bonus_pay?: number } | null)?.bonus_pay) || 0;
        const holiday = Number((existing as { holiday_pay?: number } | null)?.holiday_pay) || 0;
        const grossTaxable = calculateGrossTaxablePay({
          baseSalary: base,
          bonusPay: bonus,
          holidayPay: holiday,
        });

        // YTD sum from finalized ledgers earlier in year
        const { data: ytdRows } = await supabase
          .from('internal_payroll_ledger')
          .select('gross_taxable_pay')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .eq('status', 'finalized')
          .gte('period_end', yearStart)
          .lt('period_end', periodStart);
        const ytd = (ytdRows ?? []).reduce((s, r) => s + (Number(r.gross_taxable_pay) || 0), 0);

        let ledgerId = existing?.id;
        const payload = {
          pay_model: (d.pay_type ?? 'salary').toLowerCase(),
          employment_type: empType,
          base_salary: base,
          bonus_pay: bonus,
          holiday_pay: holiday,
          gross_taxable_pay: grossTaxable,
          gross_line_haul: 0,
          pass_through_fsc: 0,
          total_miles: 0,
        };

        if (ledgerId) {
          await supabase.from('internal_payroll_ledger').update(payload).eq('id', ledgerId);
        } else {
          const { data: inserted } = await supabase
            .from('internal_payroll_ledger')
            .insert({
              org_id: orgId,
              driver_id: d.id,
              period_start: periodStart,
              period_end: periodEnd,
              status: 'draft',
              ...payload,
            })
            .select('id')
            .single();
          ledgerId = inserted?.id;
        }
        if (!ledgerId) continue;

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

  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of ledgers) {
        if (next[r.id]) continue;
        next[r.id] = {
          bonus: Number(r.bonus_pay) || 0,
          holiday: Number(r.holiday_pay) || 0,
          fit: Number(r.federal_withholding_override) || 0,
        };
      }
      for (const key of Object.keys(next)) {
        if (!ledgers.find((l) => l.id === key)) delete next[key];
      }
      return next;
    });
  }, [ledgers]);

  const isDirty = (r: LedgerRow) => {
    const e = edits[r.id];
    if (!e) return false;
    return (
      e.bonus !== (Number(r.bonus_pay) || 0) ||
      e.holiday !== (Number(r.holiday_pay) || 0) ||
      e.fit !== (Number(r.federal_withholding_override) || 0)
    );
  };

  const updateEdit = (id: string, patch: Partial<RowEdit>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const resetRow = (r: LedgerRow) =>
    setEdits((prev) => ({
      ...prev,
      [r.id]: {
        bonus: Number(r.bonus_pay) || 0,
        holiday: Number(r.holiday_pay) || 0,
        fit: Number(r.federal_withholding_override) || 0,
      },
    }));

  // Live tax preview per row (no round-trip)
  const previewTaxes = (r: LedgerRow, e: RowEdit) => {
    if (!taxConfig) {
      return { eeTax: 0, erTax: 0, gross: 0, net: 0, ss: 0, med: 0 };
    }
    const gross = calculateGrossTaxablePay({
      baseSalary: Number(r.base_salary) || 0,
      bonusPay: e.bonus,
      holidayPay: e.holiday,
    });
    const t = calculatePayrollTaxes({
      grossTaxablePay: gross,
      ytdEarnings: 0, // preview only; DB save uses true YTD
      employmentType: r.employment_type === 'w2' ? 'w2' : '1099',
      config: taxConfig,
      federalOverride: e.fit,
      state: driverMap.get(r.driver_id)?.license_state,
    });
    const eeTax = t.eeSocialSecurity + t.eeMedicare;
    const erTax = t.erSocialSecurity + t.employerMedicare + t.txTwcUnemployment + t.flReemployment;
    const net = gross - eeTax - t.federalIncomeWithholding;
    return { eeTax, erTax, gross, net, ss: t.eeSocialSecurity, med: t.eeMedicare };
  };

  const saveRow = useMutation({
    mutationFn: async (r: LedgerRow) => {
      const e = edits[r.id];
      if (!e || !taxConfig || !orgId) return;
      const driver = driverMap.get(r.driver_id);
      const gross = calculateGrossTaxablePay({
        baseSalary: Number(r.base_salary) || 0,
        bonusPay: e.bonus,
        holidayPay: e.holiday,
      });
      const yearStart = `${new Date(r.period_start).getFullYear()}-01-01`;
      const { data: ytdRows } = await supabase
        .from('internal_payroll_ledger')
        .select('gross_taxable_pay')
        .eq('org_id', orgId)
        .eq('driver_id', r.driver_id)
        .eq('status', 'finalized')
        .gte('period_end', yearStart)
        .lt('period_end', r.period_start);
      const ytd = (ytdRows ?? []).reduce((s, x) => s + (Number(x.gross_taxable_pay) || 0), 0);

      const taxes = calculatePayrollTaxes({
        grossTaxablePay: gross,
        ytdEarnings: ytd,
        employmentType: r.employment_type === 'w2' ? 'w2' : '1099',
        config: taxConfig,
        federalOverride: e.fit,
        state: driver?.license_state,
      });

      const { error: ledErr } = await supabase
        .from('internal_payroll_ledger')
        .update({
          bonus_pay: e.bonus,
          holiday_pay: e.holiday,
          gross_taxable_pay: gross,
          federal_withholding_override: e.fit,
        })
        .eq('id', r.id);
      if (ledErr) throw ledErr;

      const { error: whErr } = await supabase.from('tax_withholding_ledger').upsert(
        {
          org_id: orgId,
          ledger_id: r.id,
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
      if (whErr) throw whErr;
    },
    onSuccess: () => {
      toast.success('Row saved');
      qc.invalidateQueries({ queryKey: ['internal_payroll_ledger'] });
      qc.invalidateQueries({ queryKey: ['tax_withholding_ledger'] });
      qc.invalidateQueries({ queryKey: ['inhouse_ledgers_all'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Save failed'),
  });

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle>Active Payroll Batch</CardTitle>
          <CardDescription>
            Salary-based ledger. Edit Bonus, Holiday, and FIT Override inline —
            Net Payout updates live: <span className="font-mono">Net = (Base + Bonus + Holiday) − (EE Tax + FIT)</span>.
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
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Base Salary</TableHead>
                <TableHead className="text-right">Bonus Pay</TableHead>
                <TableHead className="text-right">Holiday Pay</TableHead>
                <TableHead className="text-right">EE Tax</TableHead>
                <TableHead className="text-right">ER Tax</TableHead>
                <TableHead className="text-right">FIT Override</TableHead>
                <TableHead className="text-right">Net Payout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={11} className="text-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </TableCell></TableRow>
              )}
              {!isLoading && ledgers.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">
                  No batch generated for this period yet.
                </TableCell></TableRow>
              )}
              {ledgers.map((r) => {
                const driver = driverMap.get(r.driver_id);
                const name = driver
                  ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim()
                  : r.driver_id.slice(0, 8);
                const e = edits[r.id] ?? { bonus: 0, holiday: 0, fit: 0 };
                const pv = previewTaxes(r, e);
                const locked = r.status === 'finalized';
                const dirty = isDirty(r);
                const numCls = 'h-8 w-28 text-right';
                return (
                  <TableRow key={r.id} className={dirty ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {r.employment_type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(r.base_salary) || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0" disabled={locked}
                        className={numCls} value={e.bonus}
                        onChange={(ev) => updateEdit(r.id, { bonus: Math.max(0, Number(ev.target.value) || 0) })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0" disabled={locked}
                        className={numCls} value={e.holiday}
                        onChange={(ev) => updateEdit(r.id, { holiday: Math.max(0, Number(ev.target.value) || 0) })} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(pv.eeTax)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatCurrency(pv.erTax)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0"
                        disabled={locked || r.employment_type !== 'w2'}
                        className="h-8 w-24 text-right" value={e.fit}
                        onChange={(ev) => updateEdit(r.id, { fit: Math.max(0, Number(ev.target.value) || 0) })} />
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(pv.net)}
                    </TableCell>
                    <TableCell>
                      {locked
                        ? <Badge className="gap-1"><Lock className="h-3 w-3" /> Finalized</Badge>
                        : dirty
                          ? <Badge className="bg-amber-500 hover:bg-amber-600">Unsaved</Badge>
                          : <Badge variant="secondary">Draft</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!locked && dirty && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => resetRow(r)}
                            disabled={saveRow.isPending}>
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" onClick={() => saveRow.mutate(r)}
                            disabled={saveRow.isPending}>
                            <Save className="h-3.5 w-3.5 mr-1" /> Save
                          </Button>
                        </div>
                      )}
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
