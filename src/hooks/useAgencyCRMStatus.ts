import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AgencyCRMState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_found'; code: string }
  | {
      status: 'found';
      code: string;
      agentStatus: string;
      companyName: string | null;
      notes: string | null;
      isBlocked: boolean;
    };

const BLOCKED_STATUSES = new Set(['unsafe', 'not_safe', 'blocked', 'do_not_use']);

export function useAgencyCRMStatus(rawCode: string | null | undefined): AgencyCRMState {
  const { orgId } = useAuth();
  const normalized = (rawCode || '').trim().toUpperCase();
  const [debounced, setDebounced] = useState(normalized);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(normalized), 250);
    return () => clearTimeout(t);
  }, [normalized]);

  const enabled = !!orgId && debounced.length >= 2;

  const query = useQuery({
    queryKey: ['agency-crm-status', orgId, debounced],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, company_name, agent_code, agent_status, notes')
        .eq('org_id', orgId as string)
        .in('contact_type', ['agent', 'broker'])
        .ilike('agent_code', debounced)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!enabled) return { status: 'idle' };
  if (query.isLoading || query.isFetching) return { status: 'loading' };
  if (!query.data) return { status: 'not_found', code: debounced };

  const agentStatus = (query.data.agent_status || 'safe').toLowerCase();
  return {
    status: 'found',
    code: debounced,
    agentStatus,
    companyName: query.data.company_name,
    notes: query.data.notes,
    isBlocked: BLOCKED_STATUSES.has(agentStatus),
  };
}
