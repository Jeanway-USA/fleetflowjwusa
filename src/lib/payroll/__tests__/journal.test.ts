import { describe, expect, it } from 'vitest';
import { journalFor, taxLiability } from '@/lib/payroll/journal';
import type { StubData } from '@/lib/payroll/stubs';

// The Andrew Baker demo pay: gross 1,700; health 50 + 401(k) 100 + loan 40; taxes 320.31; net 1,189.69. Company pays half of
// Social Security and Medicare and adds $20 toward the health premium.
const baker: StubData = {
  itemId: 'a', name: 'Andrew Baker', payeeKind: 'Staff', payDate: '2026-10-29', periodStart: '2026-10-19', periodEnd: '2026-10-25', runStatus: 'approved',
  earnings: [], reimbursements: [],
  deductions: [{ label: 'Health insurance', amount: 50 }, { label: '401(k) traditional', amount: 100 }, { label: 'Loan repayment', amount: 40 }],
  taxes: [
    { key: 'federal_income_tax', label: 'Federal income tax', amount: 171.19 }, { key: 'social_security', label: 'Social Security', amount: 102.3 }, { key: 'medicare', label: 'Medicare', amount: 23.93 },
    { key: 'wa_pfml', label: 'WA PFML', amount: 13.32 }, { key: 'wa_cares', label: 'WA Cares', amount: 9.57 },
  ],
  employerTaxes: [{ key: 'employer_social_security', label: 'Social Security (employer)', amount: 102.3 }, { key: 'employer_medicare', label: 'Medicare (employer)', amount: 23.93 }, { key: 'futa', label: 'FUTA', amount: 9.9 }],
  employerBenefits: [{ label: 'Health insurance', amount: 20 }],
  gross: 1700, nonTaxable: 0, taxTotal: 320.31, deductionTotal: 190, net: 1189.69, ytd: { gross: 0, taxes: 0, net: 0 }, notes: [],
};
const driver: StubData = { ...baker, itemId: 'd', name: 'Siadrak Jean', payeeKind: 'Driver', deductions: [], taxes: [{ key: 'federal_income_tax', label: 'Federal income tax', amount: 100 }], employerTaxes: [], employerBenefits: [], gross: 1000, nonTaxable: 25, taxTotal: 100, deductionTotal: 0, net: 925 };

describe('journal entry for a pay run', () => {
  const j = journalFor([baker, driver]);
  const get = (a: string) => j.lines.find((l) => l.account === a);

  it('debits what the pay cost and credits who is owed', () => {
    expect(get('Wages and salaries expense')?.debit).toBe(1700);
    expect(get('Driver pay expense')?.debit).toBe(1000);
    expect(get('Reimbursements')?.debit).toBe(25);
    expect(get('Employer payroll tax expense')?.debit).toBe(136.13);
    expect(get('Employer benefit expense')?.debit).toBe(20);
    expect(get('Net pay (cash or payroll clearing)')?.credit).toBe(2114.69);
    expect(get('Payroll tax withheld payable: Federal income tax')?.credit).toBe(271.19);
    expect(get('Deductions payable: Loan repayment')?.credit).toBe(40);
    expect(get('Employer benefit payable: Health insurance')?.credit).toBe(20);
  });
  it('balances to the cent', () => {
    expect(j.totalDebit).toBe(2881.13);
    expect(j.totalCredit).toBe(2881.13);
    expect(j.balanced).toBe(true);
  });
  it('lists expenses first and net pay last', () => {
    expect(j.lines[0].account.endsWith('expense') || j.lines[0].account === 'Reimbursements').toBe(true);
    expect(j.lines[j.lines.length - 1].account).toMatch(/^Net pay/);
  });
  it('reports a stub that does not add up as unbalanced', () => {
    expect(journalFor([{ ...baker, net: 1100 }]).balanced).toBe(false);
  });
});

describe('what is owed to the tax agencies', () => {
  const l = taxLiability([baker, driver]);
  const get = (g: string) => l.rows.find((r) => r.group.startsWith(g));
  it('groups the IRS deposit: income tax plus both shares of Social Security and Medicare', () => {
    // employees: Baker 171.19 + 102.30 + 23.93 and the driver's 100.00; company: 102.30 + 23.93
    expect(get('Federal income tax, Social')).toMatchObject({ employee: 397.42, employer: 126.23 });
    expect(get('Federal income tax, Social')?.total).toBe(523.65);
  });
  it('keeps FUTA and the Washington programs separate', () => {
    expect(get('Federal unemployment')?.total).toBe(9.9);
    expect(get('Washington')).toMatchObject({ employee: 22.89, employer: 0 });
  });
  it('totals everything', () => {
    expect(l.total).toBe(556.44);
  });
  it('shows a tax it does not know as other', () => {
    expect(taxLiability([{ ...baker, taxes: [{ label: 'Mystery tax', amount: 5 }], employerTaxes: [] }]).rows[0].group).toBe('Other taxes');
  });
});
