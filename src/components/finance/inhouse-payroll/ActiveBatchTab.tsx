import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  state_sit: number;
  additional_medicare: number;
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


  const { data: profiles = new Map<string, PayeeTaxProfile>() } = useQuery({
    queryKey: ['payroll_tax_profiles', orgId],
    enabled: !!orgId,
    queryFn: () => resolveDriverTaxProfiles(orgId!),
  });

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
      tax_calculation: JSON.parse(JSON.stringify(result.audit)) as never,
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
    let gross = 0, fit = 0, eeFica = 0, erFica = 0, suta = 0, sit = 0, net = 0, ded = 0;
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
      const stSit = Number(wh.state_sit) || 0;
      const addlMed = Number(wh.additional_medicare) || 0;
      eeFica += eeSS + eeMed + addlMed;
      erFica += erSS + erMed;
      suta += stSuta;
      sit += stSit;
      const oneTimeDed = Number(r.one_time_deduction) || 0;
      ded += oneTimeDed;
      net += Math.max(
        0,
        g - (eeSS + eeMed + addlMed + stSit + (Number(wh.federal_income_withholding) || 0)) - oneTimeDed,
      );
    }
    return { count, gross, fit, eeFica, erFica, suta, sit, net, ded };

  }, [ledgers, whMap]);

  const canFinalize = ledgers.some((r) => r.status === 'draft');
  const periodLabel = `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`;

  const shift = (dir: 1 | -1) => {
    const p = shiftPeriod(freq, period.start, dir);
    setPeriod(p);
  };

  const rowViews = ledgers.map((r) => {
    const driver = driverMap.get(r.driver_id);
    const name = driver
      ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim()
      : r.driver_id.slice(0, 8);
    const w4 = w4Map.get(r.driver_id) ?? { filing_status: 'single' };
    const missing: string[] = [];
    if (!w4Map.has(r.driver_id)) missing.push('W-4');
    if (!stateW4Map.has(r.driver_id)) missing.push('State Tax');
    if (!i9Set.has(r.driver_id)) missing.push('I-9');
    const wh = whMap.get(r.id);
    const state = driver?.tax_state || driver?.license_state || config?.defaultTaxState || '—';
    const gross = Number(r.gross_taxable_pay) || 0;
    const fit = Number(wh?.federal_income_withholding) || 0;
    const eeFica = (Number(wh?.ee_social_security) || 0) + (Number(wh?.ee_medicare) || 0) + (Number(wh?.additional_medicare) || 0);
    const sit = Number(wh?.state_sit) || 0;
    const suta = (Number(wh?.state_suta) || 0) || ((Number(wh?.tx_twc_unemployment) || 0) + (Number(wh?.fl_reemployment) || 0));
    const deduction = Number(r.one_time_deduction) || 0;
    const net = Math.max(0, gross - eeFica - fit - sit - deduction);
    const note = [
      String(w4.filing_status).replace('_', ' '),
      state,
      `base ${formatCurrency(Number(r.base_salary) || 0)}`,
      (Number(r.one_time_bonus) || 0) > 0 ? `bonus ${formatCurrency(Number(r.one_time_bonus) || 0)}` : null,
    ].filter(Boolean).join(', ');
    return { r, name, note, missing, gross, fit, eeFica, sit, suta, deduction, net };
  });

  const statusBadge = (status: string) =>
    status === 'finalized' ? (
      <Badge className="gap-1"><Lock className="h-3 w-3" /> Finalized</Badge>
    ) : status === 'voided' ? (
      <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Voided</Badge>
    ) : (
      <Badge variant="secondary">Draft</Badge>
    );

  const rowActions = (r: LedgerRow) => (
    <>
      {r.status === 'draft' && (
        <>
          <Button size="icon" variant="ghost" className="h-11 w-11" onClick={() => openEdit(r)} aria-label="Edit bonus or deduction">
            <Pencil className="h-4 w-4" />
          </Button>
          <ConfirmButton
            label="Delete row"
            description="This deletes the draft payroll row and its withholding record."
            onConfirm={() => deleteRow.mutate(r.id)}
            icon={<Trash2 className="h-4 w-4" />}
          />
        </>
      )}
      {r.status === 'finalized' && (
        <ConfirmButton
          label="Void row"
          description="Voiding marks the row as voided so it won't count toward YTD. Finalized rows can't be deleted."
          onConfirm={() => voidRow.mutate(r.id)}
          icon={<Ban className="h-4 w-4" />}
        />
      )}
    </>
  );

  const missingBadge = (missing: string[]) =>
    missing.length > 0 && (
      <Badge
        variant="outline"
        className="border-amber-500/60 text-amber-700 dark:text-amber-400 text-[11px]"
        title={`Missing signed form(s): ${missing.join(', ')}. Withholding uses defaults until collected.`}
      >
        Missing: {missing.join(', ')}
      </Badge>
    );

  return (
    <div className="space-y-5">
      <Panel
        title="W-2 payroll batch"
        description={
          <>
            Tax-ready payroll for your W-2 employees. Federal tax follows IRS Pub 15-T using each driver's W-4;
            Social Security, Medicare and state taxes come from your payroll settings. Paid {freq} ({PAY_PERIODS_PER_YEAR[freq]} times a year).
          </>
        }
        aside={
          <>
            <Button className="h-11" onClick={() => generateBatch.mutate()} disabled={generateBatch.isPending || configLoading || !config}>
              {generateBatch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Generate batch
            </Button>
            <Button variant="outline" className="h-11" onClick={() => finalizeBatch.mutate()} disabled={finalizeBatch.isPending || !canFinalize}>
              {finalizeBatch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Finalize batch
            </Button>
          </>
        }
      >
        <div className="flex items-center justify-between gap-2 border-t py-2">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => shift(-1)} aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <div className="font-condensed text-lg font-bold leading-tight">{periodLabel}</div>
            <div className="text-[13px] text-muted-foreground">{totals.count} {totals.count === 1 ? 'employee' : 'employees'} in this batch</div>
          </div>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => shift(1)} aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-t">
          <StatementLine label="Gross pay" value={formatCurrency(totals.gross)} />
          <StatementLine label="Federal income tax withheld" value={`−${formatCurrency(totals.fit)}`} />
          <StatementLine label="Social Security and Medicare (employee share)" value={`−${formatCurrency(totals.eeFica)}`} />
          <StatementLine label="State income tax withheld" value={`−${formatCurrency(totals.sit)}`} />
          {totals.ded > 0 && <StatementLine label="One-time deductions" value={`−${formatCurrency(totals.ded)}`} />}
          <StatementLine label="Net pay to employees" value={formatCurrency(totals.net)} strong rule="double" />
        </div>
        <div className="border-t">
          <StatementLine label="Social Security and Medicare (your share)" note="Paid by you on top of gross pay" value={formatCurrency(totals.erFica)} muted />
          <StatementLine label="State unemployment tax" note="Paid by you on top of gross pay" value={formatCurrency(totals.suta)} muted />
        </div>
      </Panel>

      <Panel title="Pay by employee" description="Draft rows can be edited or deleted. Finalized rows can only be voided." flush>
        {isLoading ? (
          <div className="flex justify-center border-t py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : rowViews.length === 0 ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">
            No batch for this period yet. Press <b>Generate batch</b> to create one.
          </p>
        ) : (
          <>
            <ul className="divide-y border-t md:hidden">
              {rowViews.map((v) => (
                <li key={v.r.id} className={`px-4 py-3 ${v.r.status === 'voided' ? 'opacity-60' : ''}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-condensed text-lg font-bold leading-tight">{v.name}</span>
                    <span className="figure ml-auto text-lg font-semibold">{formatCurrency(v.net)}</span>
                  </div>
                  <div className="text-[13px] capitalize text-muted-foreground">{v.note}</div>
                  <div className="mt-1 text-[13px] tabular-nums text-muted-foreground">
                    Gross {formatCurrency(v.gross)}, federal {formatCurrency(v.fit)}, Social Security and Medicare {formatCurrency(v.eeFica)}, state {formatCurrency(v.sit)}
                    {v.deduction > 0 && `, deduction ${formatCurrency(v.deduction)}`}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {statusBadge(v.r.status)}
                    {missingBadge(v.missing)}
                    <div className="ml-auto flex">{rowActions(v.r)}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto border-t md:block">
              <table className="w-full text-[15px]">
                <caption className="sr-only">W-2 payroll for {periodLabel}</caption>
                <thead>
                  <tr className="border-b text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2 pl-4">Employee</th>
                    <th scope="col" className="py-2 text-right">Gross</th>
                    <th scope="col" className="py-2 text-right">Federal</th>
                    <th scope="col" className="py-2 text-right">SS and Medicare</th>
                    <th scope="col" className="py-2 text-right">State</th>
                    <th scope="col" className="py-2 text-right">Deduction</th>
                    <th scope="col" className="py-2 text-right">Net pay</th>
                    <th scope="col" className="py-2 pl-6">Status</th>
                    <th scope="col" className="py-2 pr-4"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rowViews.map((v) => (
                    <tr key={v.r.id} className={v.r.status === 'voided' ? 'opacity-60' : ''}>
                      <td className="py-2 pl-4 pr-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{v.name}</span>
                          {missingBadge(v.missing)}
                        </div>
                        <div className="text-[13px] capitalize text-muted-foreground">{v.note}</div>
                      </td>
                      <td className="figure py-2 text-right">{formatCurrency(v.gross)}</td>
                      <td className="figure py-2 text-right">{formatCurrency(v.fit)}</td>
                      <td className="figure py-2 text-right">{formatCurrency(v.eeFica)}</td>
                      <td className="figure py-2 text-right">{formatCurrency(v.sit)}</td>
                      <td className="figure py-2 text-right">{formatCurrency(v.deduction)}</td>
                      <td className="figure py-2 text-right font-semibold">{formatCurrency(v.net)}</td>
                      <td className="py-2 pl-6">{statusBadge(v.r.status)}</td>
                      <td className="py-2 pr-4"><div className="flex justify-end">{rowActions(v.r)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

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
            <div className="space-y-2">
              <Label htmlFor="w2-bonus">One-time bonus ($)</Label>
              <Input
                id="w2-bonus"
                className="h-11"
                type="number"
                step="0.01"
                min="0"
                value={editBonus}
                onChange={(e) => setEditBonus(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="w2-deduction">One-time deduction ($)</Label>
              <Input
                id="w2-deduction"
                className="h-11"
                type="number"
                step="0.01"
                min="0"
                value={editDeduction}
                onChange={(e) => setEditDeduction(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-11" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="h-11" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save and recompute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfirmButton({
  label, description, onConfirm, icon,
}: { label: string; description: string; onConfirm: () => void; icon: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={label}>{icon}</Button>
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
