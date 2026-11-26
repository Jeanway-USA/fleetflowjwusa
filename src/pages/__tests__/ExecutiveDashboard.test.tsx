import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({ startsOn: 4, loading: true, requests: [] as Array<{ table: string; filters: Record<string, string> }> }));
const names = ['executive-kpi', 'executive-operational', 'executive-costs', 'executive-performers'];
vi.mock('@/hooks/useSettlementWeekSetting', () => ({ useSettlementWeekSetting: () => state }));
vi.mock('@/hooks/usePhoneLayout', () => ({ usePhoneLayout: () => false }));
vi.mock('@/hooks/useTruckNote', () => ({ useTruckNote: () => ({}) }));
vi.mock('@tanstack/react-query', async (original) => {
  const actual = await original<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: (options: any) => actual.useQuery({ ...options, enabled: names.includes(options.queryKey[0]) && options.enabled !== false }) };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const filters: Record<string, string> = {};
  const chain: any = {};
  for (const op of ['select', 'eq', 'is', 'in', 'order']) chain[op] = () => chain;
  for (const op of ['gte', 'lte']) chain[op] = (field: string, value: string) => { filters[`${op}:${field}`] = value; return chain; };
  chain.then = (resolve: (value: unknown) => void) => {
    state.requests.push({ table, filters: { ...filters } });
    const rows = table === 'fleet_loads' ? [
      { delivery_date: '2026-11-23', gross_revenue: 100, net_revenue: 65, booked_miles: 10 },
      { delivery_date: '2026-11-26', gross_revenue: 200, net_revenue: 130, booked_miles: 20 },
    ].filter(row => row.delivery_date >= (filters['gte:delivery_date'] ?? '') && row.delivery_date <= (filters['lte:delivery_date'] ?? '9999')) : [];
    resolve({ data: rows, error: null });
  };
  return chain;
} } }));
vi.mock('@/components/executive/PeriodSelector', () => ({ PeriodSelector: () => null }));
vi.mock('@/components/executive/LogbookWeek', () => ({ LogbookWeek: () => null }));
vi.mock('@/components/executive/WeekMoneyHero', () => ({ WeekMoneyHero: () => null }));
vi.mock('@/components/executive/ActiveLoadsNow', () => ({ ActiveLoadsNow: () => null }));
vi.mock('@/components/executive/NeedsYou', () => ({ NeedsYou: () => null }));
vi.mock('@/components/executive/MoneyLines', () => ({ MoneyLines: () => null }));
vi.mock('@/components/shared/LazyFallbacks', () => ({ ChartSkeleton: () => null }));
vi.mock('@/components/executive/OperationalMetrics', () => ({ OperationalMetrics: () => null }));
vi.mock('@/components/executive/TopPerformerCards', () => ({ TopPerformerCards: () => null }));
vi.mock('@/components/executive/QuickInsights', () => ({ QuickInsights: () => null }));
vi.mock('@/components/executive/FleetStatusCard', () => ({ FleetStatusCard: () => null }));
vi.mock('@/components/executive/DriverAvailabilityCard', () => ({ DriverAvailabilityCard: () => null }));
vi.mock('@/components/executive/CriticalAlertsBar', () => ({ CriticalAlertsBar: () => null }));
vi.mock('@/components/executive/MorningBriefingWidget', () => ({ MorningBriefingWidget: () => null }));
vi.mock('@/components/executive/PendingActionsCard', () => ({ PendingActionsCard: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/components/shared/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: () => null, DialogContent: () => null }));
vi.mock('@/components/executive/PrintableExecutiveSummary', () => ({ PrintableExecutiveSummary: () => null }));
vi.mock('@/components/shared/ErrorBoundary', () => ({ ErrorBoundary: () => null }));
vi.mock('@/components/finance/RevenueOverview', () => ({ RevenueOverview: () => null }));
vi.mock('@/components/executive/RevenueTrendsChart', () => ({ RevenueTrendsChart: () => null }));
vi.mock('@/components/executive/CostBreakdownChart', () => ({ CostBreakdownChart: () => null }));
import ExecutiveDashboard from '@/pages/ExecutiveDashboard';

beforeEach(() => {
  state.startsOn = 4; state.loading = true; state.requests = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 26, 12));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000 } } });
  const tree = () => <QueryClientProvider client={client}><ExecutiveDashboard /></QueryClientProvider>;
  const view = render(tree());
  return { client, update: () => view.rerender(tree()) };
}

describe('dashboard settlement-week money', () => {
  it('waits for the saved week instead of fetching the default Thursday week', async () => {
    const { client, update } = setup();
    expect(state.requests).toHaveLength(0);
    for (const name of names) expect(client.getQueryState([name, 'week', 4])?.fetchStatus).toBe('idle');
    state.startsOn = 1; state.loading = false; update();
    await waitFor(() => { for (const name of names) expect(client.getQueryState([name, 'week', 1])?.status).toBe('success'); });
    expect(client.getQueryData<any>(['executive-kpi', 'week', 1])?.grossRevenue).toBe(300);
    const current = state.requests.filter(r => r.filters['lte:delivery_date'] === '2026-11-29');
    expect(current).toHaveLength(3);
    for (const request of current) expect(request.filters['gte:delivery_date']).toBe('2026-11-23');
  });

  it('recalculates every date-dependent query when the week changes despite five-minute fresh caches', async () => {
    state.startsOn = 1; state.loading = false;
    const { client, update } = setup();
    await waitFor(() => { for (const name of names) expect(client.getQueryState([name, 'week', 1])?.status).toBe('success'); });
    state.startsOn = 4; update();
    await waitFor(() => { for (const name of names) expect(client.getQueryState([name, 'week', 4])?.status).toBe('success'); });
    expect(client.getQueryData<any>(['executive-kpi', 'week', 4])?.grossRevenue).toBe(200);
    expect(client.getQueryData<any>(['executive-operational', 'week', 4])?.totalMiles).toBe(20);
    expect(state.requests.some(r => r.table === 'expenses' && r.filters['gte:expense_date'] === '2026-11-26' && r.filters['lte:expense_date'] === '2026-12-02')).toBe(true);
  });
});
