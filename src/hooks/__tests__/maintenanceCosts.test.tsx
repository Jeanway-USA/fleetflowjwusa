import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// A stand-in for the database that records every filter, so the rules can be checked without one.
const calls = vi.hoisted(() => ({ list: [] as Array<{ table: string; op: string; args: unknown[] }>, data: {} as Record<string, unknown[]> }));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const chain: any = {};
    for (const op of ['select', 'eq', 'is', 'gte', 'lte', 'in', 'not', 'order', 'neq']) {
      chain[op] = (...args: unknown[]) => { calls.list.push({ table, op, args }); return chain; };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: calls.data[table] ?? [], error: null });
    return chain;
  };
  return { supabase: { from } };
});

import { useCostPerMile, useMaintenanceCostMTD } from '@/hooks/useMaintenanceData';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const archivedFilter = (table: string) => calls.list.some((c) => c.table === table && c.op === 'is' && c.args[0] === 'deleted_at' && c.args[1] === null);

beforeEach(() => {
  calls.list = [];
  calls.data = { maintenance_logs: [{ cost: 100 }], work_orders: [{ final_cost: 250.5 }], fleet_loads: [{ actual_miles: 1000 }] };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 12, 21, 30)); // Oct 12, evening
});
afterEach(() => vi.useRealTimers());

describe('this month\'s maintenance spend', () => {
  it('adds finished jobs and service logs, leaving archived records out', async () => {
    const { result } = renderHook(() => useMaintenanceCostMTD(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(350.5));
    expect(archivedFilter('maintenance_logs')).toBe(true);
    expect(archivedFilter('work_orders')).toBe(true);
  });

  it('ends the month on its own last day, not the first of the next month', async () => {
    const { result } = renderHook(() => useMaintenanceCostMTD(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const range = calls.list.filter((c) => c.table === 'maintenance_logs' && c.args[0] === 'service_date');
    expect(range.find((c) => c.op === 'gte')?.args[1]).toBe('2026-10-01');
    expect(range.find((c) => c.op === 'lte')?.args[1]).toBe('2026-10-31');
  });
});

describe('cost per mile', () => {
  it('divides spend by delivered miles, leaving archived records out', async () => {
    const { result } = renderHook(() => useCostPerMile(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeCloseTo(0.3505, 4));
    expect(archivedFilter('maintenance_logs')).toBe(true);
    expect(archivedFilter('work_orders')).toBe(true);
    expect(archivedFilter('fleet_loads')).toBe(true);
  });
});
