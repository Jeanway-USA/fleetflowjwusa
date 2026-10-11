import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const row = { id: 'p1', amount: 500, truck_id: 't1', payment_date: '2026-10-05' };
let toastAction: { onClick: () => Promise<void> } | undefined;

vi.mock('sonner', () => ({
  toast: {
    success: (_msg: string, opts?: { action?: { onClick: () => Promise<void> } }) => { toastAction = opts?.action; },
    error: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { calls.push(`read ${table}`); return { data: row, error: null }; } }) }),
      delete: () => ({ eq: async () => { calls.push(`delete ${table}`); return { error: null }; } }),
      insert: async (r: unknown) => { calls.push(`insert ${table} ${JSON.stringify(r)}`); return { error: null }; },
    }),
    rpc: vi.fn(),
  },
}));

import { deleteWithUndo } from '@/lib/soft-delete';

describe('deleteWithUndo', () => {
  beforeEach(() => { calls.length = 0; toastAction = undefined; });

  it('copies the row, removes it, and Undo puts the same row back', async () => {
    const queryClient = { invalidateQueries: vi.fn() } as any;
    const after = vi.fn(async () => {});
    const ok = await deleteWithUndo({ table: 'truck_loan_payments', id: 'p1', label: 'Loan payment', queryClient, invalidateKeys: [['trucks']], afterChange: after });
    expect(ok).toBe(true);
    expect(calls).toEqual(['read truck_loan_payments', 'delete truck_loan_payments']);
    expect(after).toHaveBeenCalledTimes(1);

    await toastAction!.onClick();
    expect(calls[2]).toBe(`insert truck_loan_payments ${JSON.stringify(row)}`);
    expect(after).toHaveBeenCalledTimes(2);
  });
});
