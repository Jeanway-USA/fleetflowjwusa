import { useQuery } from '@tanstack/react-query';
import { invokeWithAuth } from '@/lib/invoke-with-auth';

export interface GustoStatus {
  company_uuid: string | null;
  onboarding_status: string;
}

/**
 * Fetches the current organization's Gusto Embedded integration status.
 * Returns `null` while loading or if the caller lacks payroll access.
 */
export function useGustoStatus(enabled = true) {
  return useQuery<GustoStatus | null>({
    queryKey: ['gusto', 'status'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await invokeWithAuth<GustoStatus>(
        'run-w2-payroll',
        { body: { action: 'status', payload: {} } },
      );
      if (error) return null;
      return data ?? null;
    },
  });
}
