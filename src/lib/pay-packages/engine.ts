import { differenceInCalendarDays, parseISO } from 'date-fns';
import { evaluateFormula, FormulaError } from '@/lib/pay-packages/formula';
import type { ComponentOverride, ExtraLine, PayComponent, PayLine, PayResult, PayWeekInput } from '@/lib/pay-packages/types';

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (v: number) => (Math.round(v * 100) / 100).toLocaleString('en-US');

/** How many pay weeks the period holds, never less than one. */
function weeksIn(week: PayWeekInput): number {
  if (!week.periodStart || !week.periodEnd) return 1;
  const days = differenceInCalendarDays(parseISO(week.periodEnd), parseISO(week.periodStart)) + 1;
  return Math.max(1, Math.round(days / 7));
}

/** The names a formula may use. */
export function formulaVariables(week: PayWeekInput, base: number, earnings: number): Record<string, number> {
  return {
    miles: week.miles,
    gross: week.grossRevenue,
    net: week.netRevenue,
    loads: week.loadCount,
    days: week.daysWorked,
    accessorials: week.accessorials,
    detention_hours: week.detentionHours,
    detention_pay: week.detentionPay,
    incidents: week.incidents,
    hours: (week.regularHours ?? 0) + (week.overtimeHours ?? 0),
    regular_hours: week.regularHours ?? 0,
    overtime_hours: week.overtimeHours ?? 0,
    base,
    earnings,
  };
}

/** Works out one component against what happened in the period. Never throws: a bad formula gives 0 and says why. */
export function calculateComponent(
  c: PayComponent,
  week: PayWeekInput,
  base: number,
  earnings: number,
): { amount: number; detail: string; error?: string } {
  const value = Number(c.value) || 0;
  switch (c.calculation_method) {
    case 'flat_weekly': {
      const weeks = weeksIn(week);
      return { amount: round2(value * weeks), detail: weeks === 1 ? `${money(value)} for the week` : `${money(value)} a week for ${weeks} weeks` };
    }
    case 'flat_daily':
      return { amount: round2(value * week.daysWorked), detail: `${money(value)} for each of ${week.daysWorked} ${week.daysWorked === 1 ? 'day' : 'days'} worked` };
    case 'per_mile':
      return { amount: round2(value * week.miles), detail: `${plain(week.miles)} miles at ${money(value)} a mile` };
    case 'percentage_of_net_revenue':
      return { amount: round2((value / 100) * week.netRevenue), detail: `${plain(value)}% of ${money(week.netRevenue)} the truck earned` };
    case 'percentage_of_gross':
      return { amount: round2((value / 100) * week.grossRevenue), detail: `${plain(value)}% of ${money(week.grossRevenue)} billed` };
    case 'fixed_amount':
      return { amount: round2(value), detail: 'Fixed amount' };
    case 'per_hour': {
      const h = week.regularHours ?? 0;
      return { amount: round2(value * h), detail: `${plain(h)} hours at ${money(value)} an hour` };
    }
    case 'overtime_hour': {
      const h = week.overtimeHours ?? 0;
      return { amount: round2(value * 1.5 * h), detail: `${plain(h)} overtime hours at 1.5 times ${money(value)} an hour (${money(round2(value * 1.5))})` };
    }
    case 'formula': {
      try {
        const amount = round2(evaluateFormula(c.formula ?? '', formulaVariables(week, base, earnings)));
        return { amount, detail: `Formula: ${c.formula}` };
      } catch (err) {
        const message = err instanceof FormulaError ? err.message : 'The formula could not be worked out';
        return { amount: 0, detail: 'Formula could not be worked out', error: `${c.label}: ${message}` };
      }
    }
    default:
      return { amount: 0, detail: 'Unknown method', error: `${c.label}: unknown calculation method` };
  }
}

/** A component's own effect on the person: money in, or money out. */
const isDeductionComponent = (c: PayComponent) => c.is_deduction;

/**
 * Pays a person for one period from the components of a package. Components are worked out in their saved
 * order, so a later formula can lean on `base` and `earnings` from the lines above it.
 */
export function calculatePackagePay(components: PayComponent[], week: PayWeekInput, extras: ExtraLine[] = []): PayResult {
  const ordered = [...components].filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const lines: PayLine[] = [];
  const errors: string[] = [];
  let base = 0;
  let earnings = 0;

  for (const c of ordered) {
    const { amount, detail, error } = calculateComponent(c, week, base, earnings);
    if (error) errors.push(error);
    // A negative result flips the line: an earning that works out below zero is taken off the pay, and a deduction
    // below zero is paid back. (Taking the absolute value alone would turn a penalty into extra pay.)
    const flipped = amount < 0;
    const deduction = isDeductionComponent(c) !== flipped;
    // A deduction is kept as a positive number and flagged, the way a settlement stores it.
    const line: PayLine = {
      componentId: c.id,
      componentType: c.component_type,
      label: c.label,
      method: c.calculation_method,
      amount: Math.abs(amount),
      isDeduction: deduction,
      isTaxable: c.is_taxable,
      detail: flipped ? `${detail} (worked out below zero, so ${deduction ? 'taken off' : 'added to'} the pay)` : detail,
      error,
      sortOrder: c.sort_order,
    };
    lines.push(line);
    if (!deduction) {
      earnings += line.amount;
      if (c.component_type === 'base_pay') base += line.amount;
    }
  }

  extras.forEach((e, i) => {
    lines.push({
      componentId: `extra-${i}`,
      componentType: 'custom',
      label: e.label,
      method: 'extra',
      amount: round2(Math.abs(e.amount)),
      isDeduction: e.is_deduction,
      isTaxable: e.is_taxable,
      detail: 'Added for this pay period only',
      sortOrder: 10_000 + i,
    });
  });

  const sum = (pick: (l: PayLine) => boolean) => round2(lines.filter(pick).reduce((s, l) => s + l.amount, 0));
  const taxableGross = sum((l) => !l.isDeduction && l.isTaxable);
  const nonTaxable = sum((l) => !l.isDeduction && !l.isTaxable);
  const deductions = sum((l) => l.isDeduction);
  return { lines, taxableGross, nonTaxable, deductions, net: round2(taxableGross + nonTaxable - deductions), errors };
}

/** Applies a one-period override: new values, formulas, or switching a component off. */
export function applyOverrides(components: PayComponent[], overrides: ComponentOverride[]): PayComponent[] {
  const byId = new Map(overrides.map((o) => [o.component_id, o]));
  return components.map((c) => {
    const o = byId.get(c.id);
    if (!o) return c;
    return {
      ...c,
      value: o.value ?? c.value,
      formula: o.formula !== undefined ? o.formula : c.formula,
      is_active: o.is_active ?? c.is_active,
    };
  });
}

/** What kind of settlement line a pay line becomes, so the existing settlement totals keep working. */
export function settlementItemType(line: PayLine): 'load_pay' | 'accessorial' | 'reimbursement' | 'deduction' {
  if (line.isDeduction) return 'deduction';
  if (!line.isTaxable) return 'reimbursement';
  return line.componentType === 'accessorial_share' || line.componentType === 'detention' ? 'accessorial' : 'load_pay';
}
