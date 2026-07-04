import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannel } from '@/lib/safe-channel';

export interface AuditLogRow {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  table_name: string;
  resource_type: string | null;
  record_id: string | null;
  previous_values: any;
  new_values: any;
  details: any;
  ip_address: string | null;
  org_id: string | null;
}

export interface AuditFilters {
  userRole?: string;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function useAuditLogs(filters: AuditFilters) {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['audit-logs', orgId, filters],
    queryFn: async (): Promise<AuditLogRow[]> => {
      if (!orgId) return [];
      let q = supabase
        .from('audit_logs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 500);

      if (filters.userRole) q = q.eq('user_role', filters.userRole);
      if (filters.actionType) q = q.eq('action', filters.actionType);
      if (filters.resourceType) q = q.eq('table_name', filters.resourceType);
      if (filters.resourceId) q = q.ilike('record_id', `%${filters.resourceId}%`);
      if (filters.from) q = q.gte('created_at', filters.from);
      if (filters.to) q = q.lte('created_at', filters.to);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as AuditLogRow[];

      // Backfill user_name for rows missing the denormalized value (legacy entries).
      const missingIds = Array.from(
        new Set(rows.filter(r => !r.user_name && r.user_id).map(r => r.user_id as string))
      );
      if (missingIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', missingIds);
        const byId = new Map(
          (profs ?? []).map(p => [
            p.user_id,
            [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || null,
          ])
        );
        for (const r of rows) {
          if (!r.user_name && r.user_id && byId.has(r.user_id)) {
            r.user_name = byId.get(r.user_id) ?? null;
          }
        }
      }

      return rows;
    },
    enabled: !!orgId,
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  });

  // Realtime: prepend new rows for this org
  useEffect(() => {
    if (!orgId) return;
    return safeChannel(`audit_logs_${orgId}`, (ch) =>
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs', filter: `org_id=eq.${orgId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['audit-logs', orgId] });
          queryClient.invalidateQueries({ queryKey: ['audit-logs-metrics', orgId] });
        },
      ),
    );
  }, [orgId, queryClient]);

  return query;
}

export function useAuditMetrics() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['audit-logs-metrics', orgId],
    queryFn: async () => {
      if (!orgId) return { total24h: 0, critical24h: 0 };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: total } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', since);

      const { count: deletes } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', since)
        .eq('action', 'DELETE');

      const { count: sensitive } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', since)
        .eq('action', 'UPDATE')
        .in('table_name', ['driver_settlements', 'settlements', 'drivers']);

      return {
        total24h: total ?? 0,
        critical24h: (deletes ?? 0) + (sensitive ?? 0),
      };
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}
