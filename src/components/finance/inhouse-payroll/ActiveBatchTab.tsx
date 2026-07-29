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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Lock, Loader2, RefreshCw, CheckCircle2, Pencil, Trash2, Ban, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { useTaxYearConfig } from '@/hooks/useTaxYearConfig';
import {
  calculatePayrollTaxes,
  resolveDriverTaxProfiles,
  PAY_PERIODS_PER_YEAR,
  EMPTY_YTD,
  type PayeeTaxProfile,
} from '@/lib/payroll';
import { calculateGrossTaxablePay } from '@/utils/payCalculations';


import {
  format, startOfWeek, endOfWeek, addWeeks, addDays,
  startOfMonth, endOfMonth, addMonths,
} from 'date-fns';

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
  one_time_bonus: number;
  one_time_deduction: number;
  gross_taxable_pay: number;
  federal_withholding_override: number | null;
  status: string;
};

type WithholdingRow = {
  ledger_id: string;
  ee_social_security: number;
  er_social_security: number;
  ee_medicare: number;
  employer_medicare: number;
  federal_income_withholding: number;
  tx_twc_unemployment: number;
  fl_reemployment: number;
  state_suta: number;
};

function defaultPeriod(freq: string, ref = new Date()) {
  if (freq === 'monthly') {
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }
  if (freq === 'biweekly') {
    const s = startOfWeek(ref, { weekStartsOn: 1 });
    return { start: s, end: addDays(s, 13) };
  }
  if (freq === 'semimonthly') {
    const d = ref.getDate();
    if (d <= 15) {
      return {
        start: new Date(ref.getFullYear(), ref.getMonth(), 1),
        end: new Date(ref.getFullYear(), ref.getMonth(), 15),
      };
    }
    return {
      start: new Date(ref.getFullYear(), ref.getMonth(), 16),
      end: endOfMonth(ref),
    };
  }
  return {
    start: startOfWeek(ref, { weekStartsOn: 1 }),
    end: endOfWeek(ref, { weekStartsOn: 1 }),
  };
}

function shiftPeriod(freq: string, start: Date, dir: 1 | -1) {
  if (freq === 'monthly') return defaultPeriod('monthly', addMonths(start, dir));
  if (freq === 'biweekly') return defaultPeriod('biweekly', addWeeks(start, 2 * dir));
  if (freq === 'semimonthly') {
    // Toggle half of the month
    if (start.getDate() === 1) {
      // move to 16th of same month if forward, else previous month 16th
      if (dir === 1) {
        return {
          start: new Date(start.getFullYear(), start.getMonth(), 16),
          end: endOfMonth(start),
        };
      }
      const prev = addMonths(start, -1);
      return {
        start: new Date(prev.getFullYear(), prev.getMonth(), 16),
        end: endOfMonth(prev),
      };
    }
    // 16th → next month 1st or same month 1st
    if (dir === 1) {
      const nxt = addMonths(start, 1);
      return {
        start: new Date(nxt.getFullYear(), nxt.getMonth(), 1),
        end: new Date(nxt.getFullYear(), nxt.getMonth(), 15),
      };
    }
    return {
      start: new Date(start.getFullYear(), start.getMonth(), 1),
      end: new Date(start.getFullYear(), start.getMonth(), 15),
    };
  }
  return defaultPeriod('weekly', addWeeks(start, dir));
}

export function ActiveBatchTab() {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();
  const { data: config, isLoading: configLoading } = useTaxYearConfig();

  const freq = config?.payFrequency ?? 'weekly';
  const [period, setPeriod] = useState(() => defaultPeriod('weekly'));
  const periodStart = format(period.start, 'yyyy-MM-dd');
  const periodEnd = format(period.end, 'yyyy-MM-dd');

  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ['w2_ledger', orgId, periodStart, periodEnd],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_payroll_ledger')
        .select('*')
        .eq('org_id', orgId!)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .eq('employment_type', 'w2')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LedgerRow[];
    },
  });

  const ledgerIds = ledgers.map((l) => l.id);
  const { data: withholdings = [] } = useQuery({
    queryKey: ['w2_withholdings', ledgerIds.join(',')],
    enabled: ledgerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_withholding_ledger')
        .select('*')
        .in('ledger_id', ledgerIds);
      if (error) throw error;
      return (data ?? []) as unknown as WithholdingRow[];
    },
  });
  const whMap = useMemo(() => {
    const m = new Map<string, WithholdingRow>();
    withholdings.forEach((w) => m.set(w.ledger_id, w));
    return m;
  }, [withholdings]);

  const { data: drivers = [] } = useQuery({
    queryKey: ['w2_drivers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, employment_type, tax_state, license_state, base_salary_per_period, status')
        .eq('org_id', orgId!)
        .eq('status', 'active')
        .eq('employment_type', 'w2_company');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: w4s = [] } = useQuery({
    queryKey: ['w2_w4s', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_w4_info')
        .select('*')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const w4Map = useMemo(() => {
    const m = new Map<string, { filing_status: string }>();
    for (const r of w4s as any[]) {
      m.set(r.driver_id, {
        filing_status: String(r.filing_status ?? 'single'),
      });
    }
    return m;
  }, [w4s]);

  const { data: stateTaxes = [] } = useQuery({
    queryKey: ['w2_state_taxes', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_state_tax_info')
        .select('driver_id, filing_status, allowances, additional_withholding, exempt')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const stateW4Map = useMemo(() => {
    const m = new Map<string, { exempt: boolean }>();
    for (const r of stateTaxes as any[]) {
      m.set(r.driver_id, {
        exempt: !!r.exempt,
      });
    }
    return m;
  }, [stateTaxes]);

  const { data: i9s = [] } = useQuery({
    queryKey: ['w2_i9s', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_i9_info')
        .select('driver_id')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const i9Set = useMemo(
    () => new Set((i9s as any[]).map((r) => r.driver_id)),
    [i9s],
  );


  const driverMap = useMemo(() => {
    const m = new Map<string, (typeof drivers)[number]>();
    drivers.forEach((d) => m.set(d.id, d));
    return m;
  }, [drivers]);

  const yearStart = `${new Date(periodStart).getFullYear()}-01-01`;

  const buildAndUpsert = async (
    driverId: string,
    base: number,
    oneTimeBonus: number,
    oneTimeDeduction: number,
    existingId: string | null,
  ) => {
    if (!orgId || !config) return;
    const driver = driverMap.get(driverId);
    const profile: PayeeTaxProfile =
      profiles.get(driverId) ?? {
        payeeId: driverId,
        payeeType: 'driver',
        name: `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim(),
        employmentClass: 'w2',
        filingStatus: 'single',
        multipleJobs: false,
        dependentsAmount: 0,
        otherIncome: 0,
        deductions: 0,
        extraWithholding: 0,
        workState: driver?.tax_state ?? null,
        residenceState: driver?.tax_state ?? null,
        stateExempt: false,
        stateAllowances: 0,
        stateAdditionalWithholding: 0,
        usedDefaults: true,
      };
    const state =
      profile.workState || driver?.tax_state || driver?.license_state || config.defaultTaxState;
    const stateCfg = config.statesByCode.get((state || '').toUpperCase()) ?? null;

    // YTD from finalized rows earlier in the tax year for this driver.
    const { data: ytdRows } = await supabase
      .from('internal_payroll_ledger')
      .select('gross_taxable_pay, status, id')
      .eq('org_id', orgId)
      .eq('driver_id', driverId)
      .eq('status', 'finalized')
      .gte('period_end', yearStart)
      .lt('period_start', periodStart);
    const ytdGross = (ytdRows ?? []).reduce(
      (s, r) => s + (Number((r as any).gross_taxable_pay) || 0),
      0,
    );

    const grossTaxable = calculateGrossTaxablePay({
      baseSalary: base,
      bonusPay: oneTimeBonus,
      holidayPay: 0,
    });

    const result = calculatePayrollTaxes({
      grossTaxablePay: grossTaxable,
      otherDeductions: oneTimeDeduction,
      profile: { ...profile, employmentClass: 'w2' },
      config: config.config,
      state: stateCfg,
      ytd: {
        ...EMPTY_YTD,
        gross: ytdGross,
        socialSecurityWages: ytdGross,
        medicareWages: ytdGross,
      },
      payFrequency: freq,
    });
    const amount = (key: string) =>
      result.employeeLines.find((l) => l.key === key)?.amount ??
      result.employerLines.find((l) => l.key === key)?.amount ??
      0;

    const netPayout = Math.max(0, result.netPay);

    const payload = {
      pay_model: 'salary',
      employment_type: 'w2',
      base_salary: base,
      bonus_pay: oneTimeBonus,
      holiday_pay: 0,
      one_time_bonus: oneTimeBonus,
      one_time_deduction: oneTimeDeduction,
      gross_taxable_pay: grossTaxable,
      gross_line_haul: 0,
      pass_through_fsc: 0,
      total_miles: 0,
      federal_withholding_override: amount('federal_income_tax'),
      tax_calculation: result.audit as unknown as Record<string, unknown>,
    };

    let ledgerId = existingId;
    if (ledgerId) {
      const { error } = await supabase
        .from('internal_payroll_ledger')
        .update(payload)
        .eq('id', ledgerId);
      if (error) throw error;
    } else {
      const { data: ins, error } = await supabase
        .from('internal_payroll_ledger')
        .insert({
          org_id: orgId,
          driver_id: driverId,
          period_start: periodStart,
          period_end: periodEnd,
          status: 'draft',
          ...payload,
        })
        .select('id')
        .single();
      if (error) throw error;
      ledgerId = ins.id;
    }

    const stateCode = (state || '').toUpperCase();
    const { error: whErr } = await supabase.from('tax_withholding_ledger').upsert(
      {
        org_id: orgId,
        ledger_id: ledgerId!,
        ee_social_security: amount('social_security'),
        er_social_security: amount('employer_social_security'),
        ee_medicare: amount('medicare'),
        employer_medicare: amount('employer_medicare'),
        additional_medicare: amount('additional_medicare'),
        federal_income_withholding: amount('federal_income_tax'),
        state_code: stateCode,
        state_suta: amount('suta'),
        state_sit: amount('state_income_tax'),
        tx_twc_unemployment: stateCode === 'TX' ? amount('suta') : 0,
        fl_reemployment: stateCode === 'FL' ? amount('suta') : 0,
      },
      { onConflict: 'ledger_id' },
    );
    if (whErr) throw whErr;

    return { ledgerId, netPayout };
  };

  const generateBatch = useMutation({
    mutationFn: async () => {
      if (!orgId || !config) throw new Error('Config not loaded');
      for (const d of drivers) {
        const base = Number((d as any).base_salary_per_period) || 0;
        const { data: existing } = await supabase
          .from('internal_payroll_ledger')
          .select('id, status, one_time_bonus, one_time_deduction')
          .eq('org_id', orgId)
          .eq('driver_id', d.id)
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .maybeSingle();
        if (existing && (existing.status === 'finalized' || existing.status === 'voided')) continue;
        if (base === 0 && !existing) continue;
        await buildAndUpsert(
          d.id,
          base,
          Number((existing as any)?.one_time_bonus) || 0,
          Number((existing as any)?.one_time_deduction) || 0,
          existing?.id ?? null,
        );
      }
    },
    onSuccess: () => {
      toast.success('Payroll batch generated');
      qc.invalidateQueries({ queryKey: ['w2_ledger'] });
      qc.invalidateQueries({ queryKey: ['w2_withholdings'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Failed to generate batch'),
  });

  const finalizeBatch = useMutation({
    mutationFn: async () => {
      const drafts = ledgers.filter((r) => r.status === 'draft');
      if (drafts.length === 0) throw new Error('No draft rows to finalize');
      const { error } = await supabase
        .from('internal_payroll_ledger')
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
          finalized_by: user?.id ?? null,
        })
        .in('id', drafts.map((r) => r.id));
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Batch finalized');
      qc.invalidateQueries({ queryKey: ['w2_ledger'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Failed to finalize'),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('internal_payroll_ledger')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Row deleted');
      qc.invalidateQueries({ queryKey: ['w2_ledger'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('internal_payroll_ledger')
        .update({
          status: 'voided',
          voided_at: new Date().toISOString(),
          voided_by: user?.id ?? null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Row voided');
      qc.invalidateQueries({ queryKey: ['w2_ledger'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Edit dialog state
  const [editing, setEditing] = useState<LedgerRow | null>(null);
  const [editBonus, setEditBonus] = useState('0');
  const [editDeduction, setEditDeduction] = useState('0');

  const openEdit = (r: LedgerRow) => {
    setEditing(r);
    setEditBonus(String(Number(r.one_time_bonus) || 0));
    setEditDeduction(String(Number(r.one_time_deduction) || 0));
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const driver = driverMap.get(editing.driver_id);
      const base = Number(driver?.base_salary_per_period) || Number(editing.base_salary) || 0;
      await buildAndUpsert(
        editing.driver_id,
        base,
        Math.max(0, Number(editBonus) || 0),
        Math.max(0, Number(editDeduction) || 0),
        editing.id,
      );
    },
    onSuccess: () => {
      toast.success('Row updated');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['w2_ledger'] });
      qc.invalidateQueries({ queryKey: ['w2_withholdings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Batch totals (from withholding rows, no client-side math on tax)
  const totals = useMemo(() => {
    let gross = 0, fit = 0, eeFica = 0, erFica = 0, suta = 0, sit = 0, net = 0;
    let count = 0;
    for (const r of ledgers) {
      if (r.status === 'voided') continue;
      const wh = whMap.get(r.id);
      const g = Number(r.gross_taxable_pay) || 0;
      gross += g;
      count += 1;
      if (!wh) continue;
      fit += Number(wh.federal_income_withholding) || 0;
      const eeSS = Number(wh.ee_social_security) || 0;
      const eeMed = Number(wh.ee_medicare) || 0;
      const erSS = Number(wh.er_social_security) || 0;
      const erMed = Number(wh.employer_medicare) || 0;
      const stSuta = (Number(wh.state_suta) || 0) || ((Number(wh.tx_twc_unemployment) || 0) + (Number(wh.fl_reemployment) || 0));
      eeFica += eeSS + eeMed;
      erFica += erSS + erMed;
      suta += stSuta;
      // SIT is stored as part of federal_withholding? No — we included in totalEE inside engine
      // For the summary, recompute SIT via ledger.state config isn't available client-side;
      // simplest: derive SIT = ledger.federal_withholding_override represents FIT only.
      // We approximated by keeping SIT out of tax_withholding_ledger. Show 0 here.
      const oneTimeDed = Number(r.one_time_deduction) || 0;
      net += Math.max(0, g - (eeSS + eeMed + Number(wh.federal_income_withholding)) - oneTimeDed);
    }
    return { count, gross, fit, eeFica, erFica, suta, sit, net };
  }, [ledgers, whMap]);

  const canFinalize = ledgers.some((r) => r.status === 'draft');
  const periodLabel = `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`;

  const shift = (dir: 1 | -1) => {
    const p = shiftPeriod(freq, period.start, dir);
    setPeriod(p);
  };

  return (
    <div className="space-y-4">
      <Card className="card-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>W-2 Active Payroll Batch</CardTitle>
            <CardDescription>
              Automatic tax-ready payroll. FIT via IRS Pub 15-T (Worksheet 1A) using each driver's
              W-4. FICA, additional Medicare, and per-state SUTA / SIT are computed from your
              payroll settings. Pay frequency:{' '}
              <span className="font-medium">{freq}</span> ({PAY_PERIODS_PER_YEAR[freq]}/yr).
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous period">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[180px] text-center">{periodLabel}</div>
            <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next period">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button onClick={() => generateBatch.mutate()}
              disabled={generateBatch.isPending || configLoading || !config}>
              {generateBatch.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              Generate Batch
            </Button>
            <Button
              variant="default"
              onClick={() => finalizeBatch.mutate()}
              disabled={finalizeBatch.isPending || !canFinalize}
            >
              {finalizeBatch.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Finalize Batch
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <TotalTile label="Employees" value={String(totals.count)} />
            <TotalTile label="Gross" value={formatCurrency(totals.gross)} />
            <TotalTile label="FIT" value={formatCurrency(totals.fit)} />
            <TotalTile label="FICA (EE)" value={formatCurrency(totals.eeFica)} />
            <TotalTile label="FICA (ER)" value={formatCurrency(totals.erFica)} />
            <TotalTile label="SUTA (ER)" value={formatCurrency(totals.suta)} />
            <TotalTile label="Net Pay" value={formatCurrency(totals.net)} highlight />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Filing</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">One-Time Bonus</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">FIT</TableHead>
                  <TableHead className="text-right">FICA (EE)</TableHead>
                  <TableHead className="text-right">SUTA (ER)</TableHead>
                  <TableHead className="text-right">One-Time Ded.</TableHead>
                  <TableHead className="text-right">Net Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={13} className="text-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  </TableCell></TableRow>
                )}
                {!isLoading && ledgers.length === 0 && (
                  <TableRow><TableCell colSpan={13} className="text-center py-6 text-muted-foreground">
                    No batch generated for this period yet. Click <b>Generate Batch</b> to create one.
                  </TableCell></TableRow>
                )}
                {ledgers.map((r) => {
                  const driver = driverMap.get(r.driver_id);
                  const name = driver
                    ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim()
                    : r.driver_id.slice(0, 8);
                  const w4 = w4Map.get(r.driver_id) ?? { filing_status: 'single' };
                  const hasW4 = w4Map.has(r.driver_id);
                  const hasStateTax = stateW4Map.has(r.driver_id);
                  const hasI9 = i9Set.has(r.driver_id);
                  const missing: string[] = [];
                  if (!hasW4) missing.push('W-4');
                  if (!hasStateTax) missing.push('State Tax');
                  if (!hasI9) missing.push('I-9');
                  const wh = whMap.get(r.id);
                  const state = driver?.tax_state || driver?.license_state || config?.defaultTaxState || '—';
                  const gross = Number(r.gross_taxable_pay) || 0;
                  const fit = Number(wh?.federal_income_withholding) || 0;
                  const eeFica = (Number(wh?.ee_social_security) || 0) + (Number(wh?.ee_medicare) || 0);
                  const suta = (Number(wh?.state_suta) || 0) || ((Number(wh?.tx_twc_unemployment) || 0) + (Number(wh?.fl_reemployment) || 0));
                  const oneTimeDed = Number(r.one_time_deduction) || 0;
                  const net = Math.max(0, gross - eeFica - fit - oneTimeDed);
                  const locked = r.status === 'finalized' || r.status === 'voided';

                  return (
                    <TableRow key={r.id} className={r.status === 'voided' ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{name}</span>
                          {missing.length > 0 && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/60 text-amber-700 dark:text-amber-400 text-[10px]"
                              title={`Missing signed form(s): ${missing.join(', ')}. Withholding uses defaults until collected.`}
                            >
                              Missing: {missing.join(', ')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="capitalize text-xs">
                        {w4.filing_status.replace('_', ' ')}
                      </TableCell>
                      <TableCell>{state}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(Number(r.base_salary) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(Number(r.one_time_bonus) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(gross)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(fit)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(eeFica)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(suta)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(oneTimeDed)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(net)}</TableCell>
                      <TableCell>
                        {r.status === 'finalized' ? (
                          <Badge className="gap-1"><Lock className="h-3 w-3" /> Finalized</Badge>
                        ) : r.status === 'voided' ? (
                          <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Voided</Badge>
                        ) : (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {r.status === 'draft' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <ConfirmButton
                                label="Delete row"
                                description="This deletes the draft payroll row and its withholding record."
                                onConfirm={() => deleteRow.mutate(r.id)}
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                              />
                            </>
                          )}
                          {r.status === 'finalized' && (
                            <ConfirmButton
                              label="Void row"
                              description="Voiding marks the row as voided so it won't count toward YTD. Finalized rows can't be deleted."
                              onConfirm={() => voidRow.mutate(r.id)}
                              icon={<Ban className="h-3.5 w-3.5" />}
                            />
                          )}
                          {locked && r.status === 'voided' && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit payroll row</DialogTitle>
            <DialogDescription>
              Base salary, W-4, and tax state come from the driver profile. Only one-time
              adjustments are editable here — everything else is recomputed automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>One-time bonus ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editBonus}
                onChange={(e) => setEditBonus(e.target.value)}
              />
            </div>
            <div>
              <Label>One-time deduction ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editDeduction}
                onChange={(e) => setEditDeduction(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save & recompute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TotalTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? 'bg-primary/5 border-primary/40' : 'bg-muted/30'}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-primary' : ''}`}>{value}</div>
    </div>
  );
}

function ConfirmButton({
  label, description, onConfirm, icon,
}: { label: string; description: string; onConfirm: () => void; icon: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">{icon}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
