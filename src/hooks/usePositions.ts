import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  assignPosition,
  fetchAreaLimit,
  setAreaLimit,
  fetchPositionAssignments,
  fetchPositions,
  savePosition,
  seedDefaultPositions,
  setChecklistItem,
  setPositionArchived,
} from '@/lib/positions/api';
import type { PositionDraft } from '@/lib/positions/types';

const KEY = ['positions'] as const;

export function usePositions() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: fetchPositions, retry: false });
}

export function useSeedPositions() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Your organization has not finished loading.');
      await seedDefaultPositions(orgId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSavePosition() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  return useMutation({
    mutationFn: async (args: { id: string | null; draft: PositionDraft }) => {
      if (!orgId) throw new Error('Your organization has not finished loading.');
      return savePosition(orgId, args.id, args.draft);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchivePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; archived: boolean }) => setPositionArchived(args.id, args.archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface Person {
  driverId?: string | null;
  userId?: string | null;
}

export function usePersonPositions(person: Person) {
  return useQuery({
    queryKey: [...KEY, 'assignments', person.driverId ?? null, person.userId ?? null],
    queryFn: () => fetchPositionAssignments({ driverId: person.driverId ?? undefined, userId: person.userId ?? undefined }),
    enabled: !!person.driverId || !!person.userId,
    retry: false,
  });
}

export function useAreaLimit(userId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'area-limit', userId ?? null],
    queryFn: () => fetchAreaLimit(userId as string),
    enabled: !!userId,
    retry: false,
  });
}

export function useSetAreaLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setAreaLimit,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['area-access'] });
    },
  });
}

export function useAssignPosition() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: assignPosition, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { assignmentId: string; itemId: string; done: boolean }) => setChecklistItem(a.assignmentId, a.itemId, a.done),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
