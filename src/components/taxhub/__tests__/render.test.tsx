import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// A database that always answers "nothing here", so the screens can be drawn without a connection.
vi.mock('@/integrations/supabase/client', () => {
  const chain: any = new Proxy(() => chain, {
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res({ data: [], error: null }) : chain),
    apply: () => chain,
  });
  return { supabase: { from: () => chain, rpc: () => chain, storage: { from: () => chain } } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ orgId: 'org-1', user: { id: 'user-1' }, isOwner: true, hasRole: () => true }) }));
vi.mock('@/components/taxhub/EmployerCard', () => ({ EmployerCard: () => <div>Employer card</div> }));

import { assembleTaxHub } from '@/lib/tax/hub';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { resolveState, STATE_CODES } from '@/lib/tax/states';
import { ZERO_AMOUNTS, type Payee, type PayRecord } from '@/lib/tax/records';
import type { StateTaxConfig } from '@/lib/payroll/types';
import { OverviewTab } from '@/components/taxhub/OverviewTab';
import { PeopleTab } from '@/components/taxhub/PeopleTab';
import { FilingsTab } from '@/components/taxhub/FilingsTab';
import { W2Tab } from '@/components/taxhub/W2Tab';
import { StatesTab } from '@/components/taxhub/StatesTab';
import { RecordsTab } from '@/components/taxhub/RecordsTab';

const prof = (id: string, type: 'driver' | 'employee', state: string) => ({ payeeId: id, payeeType: type, name: id, employmentClass: 'w2' as const, filingStatus: 'single' as const, multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: state, residenceState: state, sitState: state, stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false });
const dan: Payee = { key: 'driver:d1', type: 'driver', id: 'd1', firstName: 'Dan', lastName: 'Driver', active: true, employmentClass: 'w2', address: '1 Oak St, Dallas, TX 75001', ssnLast4: '1111', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null, profile: prof('d1', 'driver', 'TX') };
const wanda: Payee = { key: 'employee:e1', type: 'employee', id: 'e1', firstName: 'Wanda', lastName: 'Office', active: true, employmentClass: 'w2', address: '2 Pine St, Seattle, WA 98101', ssnLast4: '2222', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null, profile: prof('e1', 'employee', 'WA') };
const rec = (p: Payee, payDate: string, wages: number, state: string): PayRecord => ({ id: `${p.key}-${payDate}`, source: 'settlement', payeeKey: p.key, payeeType: p.type, payeeId: p.id, payDate, periodStart: payDate, periodEnd: payDate, wages, nonTaxable: 0, amounts: { ...ZERO_AMOUNTS }, stateCode: state, sitStateCode: state, recorded: false, notes: [] });

const config = defaultTaxYearConfig(2026);
const statesByCode = new Map<string, StateTaxConfig>(STATE_CODES.map((c) => { const r = resolveState(c, null)!; return [c, { state_code: c, suta_rate: r.sutaRate, suta_wage_base: r.sutaWageBase, has_state_income_tax: false, sit_rate: 0, rate_assumed: r.rateAssumed }]; }));
const employer = { name: 'JeanWay LLC', ein: '12-3456789', address_line1: '1 Main', address_line2: null, city: 'Dallas', state: 'TX', zip: '75001' };
const hub = assembleTaxHub({ year: 2026, payees: [dan, wanda], recordsByYear: [{ year: 2024, records: [] }, { year: 2025, records: [] }, { year: 2026, records: [rec(dan, '2026-01-09', 1500, 'TX'), rec(wanda, '2026-01-09', 1000, 'WA')] }], config, statesByCode, payFrequency: 'weekly', saved: [], employer });
const ctx = { orgId: 'org-1', config, configId: null, statesByCode, payFrequency: 'weekly' as const, defaultTaxState: 'TX' };

const wrap = (node: ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);

describe('Tax Hub screens draw with real numbers', () => {
  it('overview', () => {
    wrap(<OverviewTab hub={hub} year={2026} onOpen={() => {}} />);
    expect(screen.getByText('What needs your attention')).toBeTruthy();
    expect(screen.getByText('$2,500.00')).toBeTruthy(); // wages paid
    expect(screen.getByText(/Washington unemployment rate is needed/)).toBeTruthy();
  });
  it('people', () => {
    wrap(<PeopleTab hub={hub} ctx={ctx} year={2026} />);
    expect(screen.getByText('Dan Driver')).toBeTruthy();
    expect(screen.getByText('Wanda Office')).toBeTruthy();
  });
  it('filings', () => {
    wrap(<FilingsTab hub={hub} year={2026} />);
    expect(screen.getByText(/Form 941, quarterly return/)).toBeTruthy();
    expect(screen.getByText(/You deposit on the monthly schedule/)).toBeTruthy();
    expect(screen.getByText(/Filing calendar for 2026/)).toBeTruthy();
  });
  it('w-2s', () => {
    wrap(<W2Tab hub={hub} year={2026} employer={employer} stateIds={{}} />);
    expect(screen.getByText('2026 W-2s')).toBeTruthy();
    expect(screen.getByText(/Do the W-2s match the four Forms 941/)).toBeTruthy();
    expect(screen.getByText('Dan Driver')).toBeTruthy();
  });
  it('states', () => {
    wrap(<StatesTab hub={hub} saved={[]} />);
    expect(screen.getByText('Your states')).toBeTruthy();
    expect(screen.getAllByText('Texas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Washington').length).toBeGreaterThan(0);
  });
  it('records', () => {
    wrap(<RecordsTab hub={hub} year={2026} />);
    expect(screen.getByText('Company records for 2026')).toBeTruthy();
  });
});
