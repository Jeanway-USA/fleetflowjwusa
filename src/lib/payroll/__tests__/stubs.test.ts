import { describe, expect, it } from 'vitest';
import { generatePayStubsPdf, generateRegisterPdf } from '@/lib/pdf/generatePayStubsPdf';
import { registerRows, stubFromSettlement, stubFromStatement, taxLinesOf } from '@/lib/payroll/stubs';
import type { PayRun, PayRunItem } from '@/lib/payroll/payRun';

const item = (over: Partial<PayRunItem> = {}): PayRunItem => ({ id: 'i1', run_id: 'r', source: 'settlement', source_id: 's', payee_key: 'driver:1', payee_name: 'Siadrak Jean', gross: 1700, non_taxable: 24.38, taxes: 261.9, deductions: 50, net: 1412.48, warnings: [], ...over });
const run = { pay_date: '2026-10-29', status: 'draft' } as Pick<PayRun, 'pay_date' | 'status'>;
const calc = {
  lines: [
    { key: 'federal_income_tax', label: 'Federal income tax', amount: 131.85, side: 'employee' as const },
    { key: 'social_security', label: 'Social Security', amount: 105.4, side: 'employee' as const, rate: 0.062, taxableWages: 1700 },
    { key: 'medicare', label: 'Medicare', amount: 24.65, side: 'employee' as const, rate: 0.0145, taxableWages: 1700 },
    { key: 'employer_social_security', label: 'Employer Social Security', amount: 105.4, side: 'employer' as const },
    { key: 'suta', label: 'TX SUTA', amount: 0, side: 'employer' as const },
  ],
};
const employer = { name: 'JeanWay LLC', ein: '12-3456789', address_line1: '1 Main St', address_line2: null, city: 'Dallas', state: 'TX', zip: '75001' };
const readText = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });

describe('pay stub data', () => {
  it('splits saved taxes into what the person pays and what the company pays, leaving out zero lines', () => {
    const t = taxLinesOf(calc);
    expect(t.employee.map((l) => l.amount)).toEqual([131.85, 105.4, 24.65]);
    expect(t.employer.map((l) => l.label)).toEqual(['Employer Social Security']);
    expect(t.employee[1].detail).toBe('6.20% of 1700.00');
  });

  it('a settlement stub groups its items into earnings, reimbursements and deductions', () => {
    const s = stubFromSettlement({
      item: item(), run, period: { start: '2026-10-22', end: '2026-10-28' },
      items: [{ item_type: 'load_pay', description: 'Weekly base', amount: 1700 }, { item_type: 'reimbursement', description: 'Parking', amount: 24.38 }, { item_type: 'deduction', description: 'Advance', amount: -50 }],
      taxCalculation: calc, ytd: { gross: 1700, taxes: 261.9, net: 1412.48 }, gross: 1700, nonTaxable: 24.38, deductions: 50, net: 1412.48,
    });
    expect(s.earnings).toEqual([{ label: 'Weekly base', amount: 1700 }]);
    expect(s.reimbursements[0].amount).toBe(24.38);
    expect(s.deductions[0].amount).toBe(50); // shown as a positive number under Deductions
    expect(s.taxTotal).toBe(261.9);
  });

  it('a staff stub uses the package lines and the saved taxes', () => {
    const s = stubFromStatement({
      item: item({ source: 'staff_statement', payee_name: 'Andrew Baker' }), run, period: { start: '2026-10-19', end: '2026-10-25' },
      lines: [{ label: 'Weekly base', amount: 1700, isDeduction: false, isTaxable: true }], taxCalculation: calc, ytd: { gross: 1700, taxes: 261.9, net: 1412.48 },
    });
    expect(s.payeeKind).toBe('Staff');
    expect(s.earnings).toHaveLength(1);
  });

  it('the register adds the company taxes for each person', () => {
    const s = stubFromSettlement({ item: item(), run, period: { start: 'a', end: 'b' }, items: [], taxCalculation: calc, ytd: { gross: 1, taxes: 1, net: 1 }, gross: 1700, nonTaxable: 0, deductions: 0, net: 1438.1 });
    expect(registerRows([s])[0].employerTotal).toBe(105.4);
  });
});

describe('pay stub and register files', () => {
  const s = stubFromSettlement({ item: item(), run, period: { start: '2026-10-22', end: '2026-10-28' }, items: [{ item_type: 'load_pay', description: 'Weekly base', amount: 1700 }], taxCalculation: calc, ytd: { gross: 1700, taxes: 261.9, net: 1412.48 }, gross: 1700, nonTaxable: 24.38, deductions: 50, net: 1412.48 });
  it('makes one page per stub', async () => {
    const blob = generatePayStubsPdf([s, { ...s, itemId: 'i2', name: 'Andrew Baker' }], employer);
    const text = await readText(blob);
    expect(text.match(/\/Type\s*\/Page\b/g)?.length).toBe(2);
  });
  it('makes a register', () => {
    expect(generateRegisterPdf([s], { pay_date: '2026-10-29', status: 'draft' } as PayRun, employer).size).toBeGreaterThan(1000);
  });
});
