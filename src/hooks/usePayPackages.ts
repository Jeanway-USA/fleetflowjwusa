import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  assignPackage,
  createOverride,
  endAssignment,
  fetchAssignments,
  fetchComponents,
  fetchOverrides,
  fetchPackages,
  fetchVersions,
  savePackage,
  setArchived,
  voidOverride,
  type PackageDraft,
} from '@/lib/pay-packages/api';
import type { PayComponent } from '@/lib/pay-packages/types';

const KEY = ['pay-packages'] as const;

/** True when the database has not had the pay package migration applied yet. */
export function isMissingTables(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? '');
  return /pay_packages|pay_package_|schema cache|does not exist|relation/i.test(message);
}

export function usePayPackages() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: fetchPackages, retry: false });
}

export function usePackageComponents(packageId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'components', packageId],
    queryFn: () => fetchComponents(packageId as string),
    enabled: !!packageId,
  });
}

export function usePackageVersions(packageId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'versions', packageId],
    queryFn: () => fetchVersions(packageId as string),
    enabled: !!packageId,
  });
}

/** Which pay package each listed settlement was paid under (empty before the pay package upgrade is applied). */
export function useSettlementPackages(settlementIds: string[]) {
  const key = settlementIds.slice().sort().join(',');
  return useQuery({
    queryKey: [...KEY, 'settlement-packages', key],
    enabled: settlementIds.length > 0,
    retry: false,
    queryFn: async () => {
      const map = new Map<string, string>();
      const { data, error } = await (supabase as any).from('settlement_pay_snapshots').select('settlement_id, package_name').in('settlement_id', settlementIds);
      if (!error) for (const r of data ?? []) map.set(r.settlement_id, r.package_name ?? 'Pay package');
      return map;
    },
  });
}

export function useSavePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { packageId: string | null; pkg: PackageDraft; components: PayComponent[]; note?: string }) =>
      savePackage(args.packageId, args.pkg, args.components, args.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchivePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { packageId: string; archived: boolean }) => setArchived(args.packageId, args.archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDriverAssignments(driverId: string | null, userId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'assignments', driverId ?? null, userId ?? null],
    queryFn: () => fetchAssignments({ driverId: driverId ?? undefined, userId: userId ?? undefined }),
    enabled: !!driverId || !!userId,
    retry: false,
  });
}

export function useAssignPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assignPackage,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useEndAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; endDate: string }) => endAssignment(args.id, args.endDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDriverOverrides(driverId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'overrides', driverId],
    queryFn: () => fetchOverrides(driverId as string),
    enabled: !!driverId,
    retry: false,
  });
}

export function useCreateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { override: Parameters<typeof createOverride>[0]; orgId: string }) => createOverride(args.override, args.orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useVoidOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: voidOverride,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
