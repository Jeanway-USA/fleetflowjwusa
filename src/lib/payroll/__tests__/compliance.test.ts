import { describe, expect, it } from 'vitest';
import { minimumWage, wageIssues } from '@/lib/payroll/compliance';

describe('minimum wage by state and date', () => {
  it('uses the state rate in force on the date', () => {
    expect(minimumWage('WA', '2026-10-25')).toEqual({ rate: 17.13, source: 'state', state: 'WA' });
    expect(minimumWage('WA', '2025-12-31').rate).toBe(16.66);
    expect(minimumWage('fl', '2026-09-29').rate).toBe(14);
    expect(minimumWage('FL', '2026-10-01').rate).toBe(15);
  });
  it('uses the federal rate for a state not listed, and says so', () => {
    expect(minimumWage('TX', '2026-10-25')).toEqual({ rate: 7.25, source: 'federal', state: 'TX' });
    expect(minimumWage(null, '2026-10-25').source).toBe('federal');
  });
});

const base = { state: 'WA', date: '2026-10-25', regularHours: 40, overtimeHours: 0, hourlyRate: 25, hasOvertimePay: true, taxableGross: 1000 };

describe('wage checks for an hourly week', () => {
  it('a normal week raises nothing', () => {
    expect(wageIssues(base)).toEqual([]);
    expect(wageIssues({ ...base, regularHours: 0 })).toEqual([]);
  });
  it('blocks overtime hours when the package pays no overtime', () => {
    const r = wageIssues({ ...base, overtimeHours: 6, hasOvertimePay: false, taxableGross: 1000 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ level: 'block' });
    expect(r[0].message).toMatch(/6 overtime hours/);
  });
  it('blocks hours with no hourly rate at all', () => {
    expect(wageIssues({ ...base, hourlyRate: null })[0].message).toMatch(/no hourly rate/);
  });
  it('blocks a rate under the state minimum', () => {
    const r = wageIssues({ ...base, hourlyRate: 17, taxableGross: 680 });
    expect(r[0].message).toMatch(/\$17\.00 is below the WA minimum wage of \$17\.13/);
  });
  it('accepts a rate exactly at the minimum', () => {
    expect(wageIssues({ ...base, hourlyRate: 17.13, taxableGross: 685.2 })).toEqual([]);
  });
  it('blocks when all pay for the hours still averages under the minimum', () => {
    const r = wageIssues({ ...base, hourlyRate: 20, taxableGross: 600 });
    expect(r).toHaveLength(1);
    expect(r[0].message).toMatch(/averages \$15\.00 an hour/);
  });
  it('says plainly when only the federal rate was checked', () => {
    const r = wageIssues({ ...base, state: 'TX', hourlyRate: 7, taxableGross: 280 });
    expect(r[0].message).toMatch(/federal minimum wage \(TX has no rate on file/);
  });
});
