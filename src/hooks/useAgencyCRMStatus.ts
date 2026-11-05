import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { escapeLike, pickAgencyRow, realCompanyName, type AgencyRow } from '@/lib/loads/agency';

export type AgencyCRMState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** The lookup itself failed. This must never be shown as a new agency. */
  | { status: 'error'; code: string }
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
    // Agents the system adds from a load live in company_resources (type load_agent); agents typed into the CRM are in
    // crm_contacts. A code is new only when it is in neither.
    queryFn: async (): Promise<AgencyRow | null> => {
      const like = escapeLike(debounced);
      const [resource, crm] = await Promise.all([
        supabase
          .from('company_resources')
          .select('name, agent_code, agent_status, notes')
          .eq('org_id', orgId as string)
          .eq('resource_type', 'load_agent')
          .is('deleted_at', null)
          .ilike('agent_code', like)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('crm_contacts')
          .select('company_name, agent_code, agent_status, notes')
          .eq('org_id', orgId as string)
          .in('contact_type', ['agent', 'broker'])
          .ilike('agent_code', like)
          .limit(1)
          .maybeSingle(),
      ]);
      // If a place could not be searched, do not claim the agency is new.
      if ((resource.error && !resource.data && !crm.data) || (crm.error && !crm.data && !resource.data)) throw resource.error ?? crm.error;
      const r = resource.data ? { company_name: resource.data.name, agent_code: resource.data.agent_code, agent_status: resource.data.agent_status, notes: resource.data.notes } : null;
      return pickAgencyRow(r, crm.data as AgencyRow | null);
    },
  });

  if (!enabled) return { status: 'idle' };
  if (query.isLoading || query.isFetching) return { status: 'loading' };
  if (query.isError) return { status: 'error', code: debounced };
  if (!query.data) return { status: 'not_found', code: debounced };

  const agentStatus = (query.data.agent_status || 'safe').toLowerCase();
  return {
    status: 'found',
    code: debounced,
    agentStatus,
    companyName: realCompanyName(query.data),
    notes: query.data.notes,
    isBlocked: BLOCKED_STATUSES.has(agentStatus),
  };
}
