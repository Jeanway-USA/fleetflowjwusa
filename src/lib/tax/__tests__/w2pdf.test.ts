import { describe, expect, it } from 'vitest';
import { formatSsn, generateFilingSheetPdf, generateW2Pdf, maskedSsn } from '@/lib/pdf/generateW2Pdf';
import { buildW2 } from '@/lib/tax/reports';
import { ZERO_AMOUNTS, type Payee, type PayRecord } from '@/lib/tax/records';

const payee: Payee = {
  key: 'employee:1', type: 'employee', id: '1', firstName: 'Ana', lastName: 'Lopez', active: true, employmentClass: 'w2', address: '12 Pine St, Seattle, WA 98101',
  ssnLast4: '6789', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null,
  profile: { payeeId: '1', payeeType: 'employee', name: 'Ana Lopez', employmentClass: 'w2', filingStatus: 'single', multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: 'WA', residenceState: 'WA', sitState: 'WA', stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false },
};
const record: PayRecord = {
  id: 'r1', source: 'staff', payeeKey: 'employee:1', payeeType: 'employee', payeeId: '1', payDate: '2026-06-05', periodStart: '2026-05-30', periodEnd: '2026-06-05',
  wages: 1000, nonTaxable: 0, stateCode: 'WA', sitStateCode: 'WA', recorded: true, notes: [], amounts: { ...ZERO_AMOUNTS, fit: 100, ss: 62, medicare: 14.5, employerSs: 62, employerMedicare: 14.5 },
};
const readText = (b: Blob) => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(b); });
const employer = { name: 'JeanWay LLC', ein: '12-3456789', address_line1: '1 Main St', address_line2: null, city: 'Dallas', state: 'TX', zip: '75001' };

describe('W-2 employee copies', () => {
  const w2 = buildW2(payee, [record], 2026, { social_security_wage_base: 184500 });

  it('prints copies B, C and the employer copy (no Copy 2 when no state income tax applies), each with its notice page', async () => {
    const blob = generateW2Pdf({ year: 2026, employer, w2 });
    expect(blob.size).toBeGreaterThan(2000);
    const text = await readText(blob);
    // B front, B back, C front, C back, D front = 5 pages
    expect(text.match(/\/Type\s*\/Page\b/g)?.length).toBe(5);
  });

  it('adds Copy 2 when a state income tax applies', async () => {
    const withState = buildW2(payee, [{ ...record, sitStateCode: 'GA', amounts: { ...record.amounts, sit: 40 } }], 2026, { social_security_wage_base: 184500 });
    const text = await readText(generateW2Pdf({ year: 2026, employer, w2: withState, stateIds: { GA: '123' } }));
    expect(text.match(/\/Type\s*\/Page\b/g)?.length).toBe(7);
  });

  it('truncates the Social Security number on employee copies', () => {
    expect(maskedSsn('123-45-6789', null)).toBe('***-**-6789');
    expect(maskedSsn(null, '6789')).toBe('***-**-6789');
    expect(formatSsn('123456789')).toBe('123-45-6789');
  });

  it('builds the filing worksheet with W-3 totals', async () => {
    const blob = generateFilingSheetPdf({ year: 2026, employer, forms: [{ w2, ssnFull: '123456789' }] });
    expect(blob.size).toBeGreaterThan(1000);
  });
});
