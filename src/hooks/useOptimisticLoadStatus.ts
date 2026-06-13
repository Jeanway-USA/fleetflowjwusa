import { useCallback } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

export const NETWORK_ERROR_TOAST =
  'Network error. Please try again when you have a better signal.';

const matchesDriverLoads = (query: { queryKey: QueryKey }) => {
  const k = query.queryKey?.[0];
  return k === 'driver-active-loads' || k === 'driver-loads';
};

type LoadPatch = Record<string, unknown>;

function patchList(data: unknown, loadId: string, patch: LoadPatch): unknown {
  if (Array.isArray(data)) {
    return data.map((row: any) =>
      row && row.id === loadId ? { ...row, ...patch } : row,
    );
  }
  if (data && typeof data === 'object' && (data as any).id === loadId) {
    return { ...(data as any), ...patch };
  }
  return data;
}

export function useOptimisticLoadStatus() {
  const queryClient = useQueryClient();

  const applyOptimistic = useCallback(
    (loadId: string, patch: LoadPatch) => {
      // Snapshot all matching caches.
      const snapshot = queryClient.getQueriesData({ predicate: matchesDriverLoads });

      // Cancel in-flight refetches so they don't clobber the optimistic patch.
      void queryClient.cancelQueries({ predicate: matchesDriverLoads });

      // Apply patch.
      queryClient.setQueriesData(
        { predicate: matchesDriverLoads },
        (old: unknown) => patchList(old, loadId, patch),
      );

      const rollback = (opts: { silent?: boolean } = {}) => {
        for (const [key, data] of snapshot) {
          queryClient.setQueryData(key, data);
        }
        if (!opts.silent) toast.error(NETWORK_ERROR_TOAST);
      };

      const commit = () => {
        void queryClient.invalidateQueries({ predicate: matchesDriverLoads });
      };

      return { commit, rollback };
    },
    [queryClient],
  );

  return { applyOptimistic };
}
