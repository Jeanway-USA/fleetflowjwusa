import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const calls = vi.hoisted(() => ({ updates: [] as unknown[], inserts: [] as unknown[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => ({
        eq: async () => {
          calls.updates.push(payload);
          return { error: null };
        },
      }),
      insert: async (payload: unknown) => {
        calls.inserts.push(payload);
        return { error: null };
      },
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useOfflineQueue } from '@/hooks/useOfflineQueue';

const STOP = '11111111-1111-4111-8111-111111111111';
const queued = (type: string, payload: Record<string, unknown>) =>
  localStorage.setItem('offline_action_queue', JSON.stringify([{ id: 'a1', type, payload, timestamp: Date.now() }]));

describe('the offline queue', () => {
  beforeEach(() => {
    localStorage.clear();
    calls.updates.length = 0;
    calls.inserts.length = 0;
  });

  it('sends a saved stop confirmation when the signal returns', async () => {
    queued('stop_confirm', { id: STOP, remaining_hos: 7.5, completed_at: '2026-10-20T15:00:00.000Z' });
    const { result } = renderHook(() => useOfflineQueue());
    await act(async () => { await result.current.syncAll(); });
    expect(calls.updates).toEqual([{ status: 'completed', remaining_hos: 7.5, completed_at: '2026-10-20T15:00:00.000Z' }]);
    expect(JSON.parse(localStorage.getItem('offline_action_queue') ?? '[]')).toEqual([]);
  });

  it('keeps a saved action that is not valid instead of sending it', async () => {
    queued('stop_confirm', { id: 'not-a-uuid', remaining_hos: 7, completed_at: '2026-10-20T15:00:00.000Z' });
    const { result } = renderHook(() => useOfflineQueue());
    await act(async () => { await result.current.syncAll(); });
    expect(calls.updates).toEqual([]);
    expect(JSON.parse(localStorage.getItem('offline_action_queue') ?? '[]')).toHaveLength(1);
  });

  it('rejects hours outside what a driver can have left', async () => {
    queued('stop_confirm', { id: STOP, remaining_hos: 40, completed_at: '2026-10-20T15:00:00.000Z' });
    const { result } = renderHook(() => useOfflineQueue());
    await act(async () => { await result.current.syncAll(); });
    expect(calls.updates).toEqual([]);
  });

  it('sends each saved action once even when many screens hear the signal come back', async () => {
    queued('fuel_receipt', { expense_type: 'Fuel', amount: 100, expense_date: '2026-10-20' });
    // Eight load cards on My Loads each hold their own copy of the hook.
    const hooks = Array.from({ length: 8 }, () => renderHook(() => useOfflineQueue()));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('offline_action_queue') ?? '[]')).toEqual([]));
    expect(calls.inserts).toHaveLength(1);
    hooks.forEach((h) => h.unmount());
  });
});
