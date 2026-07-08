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

type RowEdit = {
  gross: number;
  reimburse: number;
  eeTax: number;
  erTax: number;
  fit: number;
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
        const { data: loads } = await supabase
          .from('fleet_loads')
          .select('gross_revenue, fsc_amount, actual_miles, booked_miles')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .gte('delivery_date', periodStart)
          .lte('delivery_date', periodEnd);

        const gross = (loads ?? []).reduce((s, l) => s + (Number(l.gross_revenue) || 0), 0);
        const fsc = (loads ?? []).reduce((s, l) => s + (Number(l.fsc_amount) || 0), 0);
        const miles = (loads ?? []).reduce(
          (s, l) => s + (Number(l.actual_miles) || Number(l.booked_miles) || 0), 0,
        );
        const payModel = (d.pay_type ?? 'per_mile').toLowerCase();
        const empType = d.employment_type === 'w2_company' ? 'w2' : '1099';
        const grossTaxable = calculateLineHaulBase({ grossTotal: gross, fscAmount: fsc, payModel });

        if (gross === 0 && miles === 0) continue;

        const { data: ytdRows } = await supabase
          .from('internal_payroll_ledger')
          .select('gross_taxable_pay')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .eq('status', 'finalized')
          .gte('period_end', yearStart)
          .lt('period_end', periodStart);
        const ytd = (ytdRows ?? []).reduce((s, r) => s + (Number(r.gross_taxable_pay) || 0), 0);

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

  // Local edit state per ledger row
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  // Hydrate edits when data changes (only for rows not already dirty)
  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of ledgers) {
        if (next[r.id]) continue; // preserve dirty edits
        const w = withholdingMap.get(r.id);
        const eeTax =
          (Number(w?.ee_social_security) || 0) +
          (Number(w?.ee_medicare) || 0) +
          (Number(w?.federal_income_withholding) || 0);
        const erTax =
          (Number(w?.er_social_security) || 0) +
          (Number(w?.employer_medicare) || 0) +
          (Number(w?.tx_twc_unemployment) || 0) +
          (Number(w?.fl_reemployment) || 0);
        next[r.id] = {
          gross: Number(r.gross_line_haul) || 0,
          reimburse: Number(r.pass_through_fsc) || 0,
          eeTax,
          erTax,
          fit: Number(r.federal_withholding_override) || 0,
        };
      }
      // drop edits for rows no longer present
      for (const key of Object.keys(next)) {
        if (!ledgers.find((l) => l.id === key)) delete next[key];
      }
      return next;
    });
  }, [ledgers, withholdingMap]);

  const isDirty = (r: LedgerRow) => {
    const e = edits[r.id];
    if (!e) return false;
    const w = withholdingMap.get(r.id);
    const eeTax =
      (Number(w?.ee_social_security) || 0) +
      (Number(w?.ee_medicare) || 0) +
      (Number(w?.federal_income_withholding) || 0);
    const erTax =
      (Number(w?.er_social_security) || 0) +
      (Number(w?.employer_medicare) || 0) +
      (Number(w?.tx_twc_unemployment) || 0) +
      (Number(w?.fl_reemployment) || 0);
    return (
      e.gross !== (Number(r.gross_line_haul) || 0) ||
      e.reimburse !== (Number(r.pass_through_fsc) || 0) ||
      e.eeTax !== eeTax ||
      e.erTax !== erTax ||
      e.fit !== (Number(r.federal_withholding_override) || 0)
    );
  };

  const updateEdit = (id: string, patch: Partial<RowEdit>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const resetRow = (r: LedgerRow) => {
    const w = withholdingMap.get(r.id);
    const eeTax =
      (Number(w?.ee_social_security) || 0) +
      (Number(w?.ee_medicare) || 0) +
      (Number(w?.federal_income_withholding) || 0);
    const erTax =
      (Number(w?.er_social_security) || 0) +
      (Number(w?.employer_medicare) || 0) +
      (Number(w?.tx_twc_unemployment) || 0) +
      (Number(w?.fl_reemployment) || 0);
    setEdits((prev) => ({
      ...prev,
      [r.id]: {
        gross: Number(r.gross_line_haul) || 0,
        reimburse: Number(r.pass_through_fsc) || 0,
        eeTax,
        erTax,
        fit: Number(r.federal_withholding_override) || 0,
      },
    }));
  };

  const saveRow = useMutation({
    mutationFn: async (r: LedgerRow) => {
      const e = edits[r.id];
      if (!e) return;
      const driver = driverMap.get(r.driver_id);
      const grossTaxable = calculateLineHaulBase({
        grossTotal: e.gross,
        fscAmount: e.reimburse,
        payModel: r.pay_model,
      });

      const { error: ledErr } = await supabase
        .from('internal_payroll_ledger')
        .update({
          gross_line_haul: e.gross,
          pass_through_fsc: e.reimburse,
          gross_taxable_pay: grossTaxable,
          federal_withholding_override: e.fit,
        })
        .eq('id', r.id);
      if (ledErr) throw ledErr;

      // Split EE/ER totals proportionally against current breakdown
      const w = withholdingMap.get(r.id);
      const curEeSS = Number(w?.ee_social_security) || 0;
      const curEeMed = Number(w?.ee_medicare) || 0;
      const curEeFit = Number(w?.federal_income_withholding) || 0;
      const curEeTotal = curEeSS + curEeMed + curEeFit;

      let eeSS = 0, eeMed = 0, eeFit = e.eeTax;
      if (curEeTotal > 0) {
        eeSS = +(e.eeTax * (curEeSS / curEeTotal)).toFixed(2);
        eeMed = +(e.eeTax * (curEeMed / curEeTotal)).toFixed(2);
        eeFit = +(e.eeTax - eeSS - eeMed).toFixed(2);
      }

      const curErSS = Number(w?.er_social_security) || 0;
      const curErMed = Number(w?.employer_medicare) || 0;
      const curErTx = Number(w?.tx_twc_unemployment) || 0;
      const curErFl = Number(w?.fl_reemployment) || 0;
      const curErTotal = curErSS + curErMed + curErTx + curErFl;

      let erSS = 0, erMed = 0, erTx = e.erTax, erFl = 0;
      if (curErTotal > 0) {
        erSS = +(e.erTax * (curErSS / curErTotal)).toFixed(2);
        erMed = +(e.erTax * (curErMed / curErTotal)).toFixed(2);
        erFl = +(e.erTax * (curErFl / curErTotal)).toFixed(2);
        erTx = +(e.erTax - erSS - erMed - erFl).toFixed(2);
      }

      const { error: whErr } = await supabase.from('tax_withholding_ledger').upsert(
        {
          org_id: orgId!,
          ledger_id: r.id,
          ee_social_security: eeSS,
          ee_medicare: eeMed,
          federal_income_withholding: eeFit,
          er_social_security: erSS,
          employer_medicare: erMed,
          tx_twc_unemployment: erTx,
          fl_reemployment: erFl,
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
    onError: (e: Error) => toast.error(e.message ?? 'Save failed'),
  });

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle>Active Payroll Batch</CardTitle>
          <CardDescription>
            Editable ledger — adjust Gross, Reimburse, EE Tax, ER Tax, or FIT inline.
            Net recomputes live: <span className="font-mono">Net = (Gross + Reimburse) − EE Tax</span>.
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
                <TableHead className="text-right">Gross Pay</TableHead>
                <TableHead className="text-right">Reimburse</TableHead>
                <TableHead className="text-right">EE Tax</TableHead>
                <TableHead className="text-right">ER Tax</TableHead>
                <TableHead className="text-right">FIT Override</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
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
                const driver = driverMap.get(r.driver_id);
                const name = driver
                  ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim()
                  : r.driver_id.slice(0, 8);
                const e = edits[r.id] ?? { gross: 0, reimburse: 0, eeTax: 0, erTax: 0, fit: 0 };
                const net = (e.gross + e.reimburse) - e.eeTax;
                const locked = r.status === 'finalized';
                const dirty = isDirty(r);
                const numCls = 'h-8 w-28 text-right';
                return (
                  <TableRow key={r.id} className={dirty ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {r.pay_model} · {r.employment_type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0" disabled={locked}
                        className={numCls} value={e.gross}
                        onChange={(ev) => updateEdit(r.id, { gross: Math.max(0, Number(ev.target.value) || 0) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0" disabled={locked}
                        className={numCls} value={e.reimburse}
                        onChange={(ev) => updateEdit(r.id, { reimburse: Math.max(0, Number(ev.target.value) || 0) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0" disabled={locked}
                        className={numCls} value={e.eeTax}
                        onChange={(ev) => updateEdit(r.id, { eeTax: Math.max(0, Number(ev.target.value) || 0) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0" disabled={locked}
                        className={numCls} value={e.erTax}
                        onChange={(ev) => updateEdit(r.id, { erTax: Math.max(0, Number(ev.target.value) || 0) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" min="0"
                        disabled={locked || r.employment_type !== 'w2'}
                        className="h-8 w-24 text-right" value={e.fit}
                        onChange={(ev) => updateEdit(r.id, { fit: Math.max(0, Number(ev.target.value) || 0) })}
                      />
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(net)}
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
