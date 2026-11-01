import { describe, expect, it } from 'vitest';
import { newHiresDue } from '@/lib/payroll/newHire';
import type { Payee } from '@/lib/tax/records';

const p = (key: string, hireDate: string | null, o: Partial<Payee> = {}): Payee => ({ key, type: 'employee', id: key, firstName: key, lastName: 'X', active: true, employmentClass: 'w2', address: '1 Oak', ssnLast4: '1234', hasW4: true, hasStateForm: true, hasI9: true, hireDate, profile: {} as never, ...o });

describe('new hires to report', () => {
  const today = '2026-10-31';
  const list = newHiresDue([p('a', '2026-10-20'), p('b', '2026-10-01'), p('c', '2026-09-30'), p('old', '2026-01-01'), p('none', null), p('future', '2026-11-05'), p('contractor', '2026-10-25', { employmentClass: 'contractor' })], new Set(), today);

  it('gives each a deadline 20 days after the hire date, soonest first', () => {
    expect(list.map((r) => [r.payee.key, r.deadline, r.daysLeft])).toEqual([['c', '2026-10-20', -11], ['b', '2026-10-21', -10], ['a', '2026-11-09', 9]]);
  });
  it('lists late ones as late rather than dropping them, but not old hires, undated, future or contractors', () => {
    expect(list.map((r) => r.payee.key)).not.toContain('old');
    expect(list.map((r) => r.payee.key)).not.toContain('none');
    expect(list.map((r) => r.payee.key)).not.toContain('future');
    expect(list.map((r) => r.payee.key)).not.toContain('contractor');
  });
  it('leaves out anyone already reported', () => {
    expect(newHiresDue([p('a', '2026-10-20')], new Set(['a']), today)).toEqual([]);
  });
  it('says what is missing for the report', () => {
    const r = newHiresDue([p('a', '2026-10-20', { address: null, ssnLast4: null, hasW4: false })], new Set(), today)[0];
    expect(r.missing).toEqual(['home address', 'Social Security number', 'W-4']);
  });
});
