import { describe, expect, it } from 'vitest';
import { paymentListRows, planPayments, toCents, type BankStatus, type Payment } from '@/lib/payroll/payments';
import type { PayRunItem } from '@/lib/payroll/payRun';

const item = (id: string, net: number): PayRunItem => ({ id, run_id: 'r', source: 'settlement', source_id: id, payee_key: `driver:${id}`, payee_name: `Person ${id}`, gross: net, non_taxable: 0, taxes: 0, deductions: 0, net, warnings: [] } as unknown as PayRunItem);
const bank = new Map<string, BankStatus>([['a', { item_id: 'a', bank_name: 'Chase', account_type: 'checking', account_last4: '4321' }]]);

describe('how each person is paid', () => {
  const plan = planPayments([item('a', 1189.69), item('b', 2077.13), item('c', 0)], bank);
  it('direct deposit when bank details are on file, a check when not, nothing when there is nothing to pay', () => {
    expect(plan.map((p) => p.method)).toEqual(['direct_deposit', 'check', 'manual']);
    expect(plan[0].last4).toBe('4321');
    expect(plan[1].last4).toBeNull();
  });
  it('amounts are to the cent', () => {
    expect(plan[0].amount).toBe(1189.69);
    expect(toCents(1189.69)).toBe(118969);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe('payment list', () => {
  it('shows only the last 4 digits of an account', () => {
    const p = { payee_name: 'A', method: 'direct_deposit', account_last4: '4321', check_number: null, amount: 10, status: 'pending' } as unknown as Payment;
    expect(paymentListRows([p])[0]).toEqual(['A', 'Direct deposit', 'ending 4321', '', 10, 'Not sent']);
  });
});
