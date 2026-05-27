import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ThreadSenderRole =
  | 'driver'
  | 'maintenance'
  | 'owner'
  | 'safety'
  | 'dispatcher'
  | 'payroll_admin';

export interface ThreadMessage {
  id: string;
  request_id: string;
  sender_user_id: string;
  sender_role: ThreadSenderRole;
  sender_name: string | null;
  message_type: 'chat' | 'recommendation';
  body: string;
  recommendation: { title?: string; category?: string } | null;
  created_at: string;
}

export function useMaintenanceThread(requestId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['maintenance-thread', requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<ThreadMessage[]> => {
      const { data, error } = await supabase
        .from('maintenance_request_messages')
        .select('*')
        .eq('request_id', requestId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ThreadMessage[];
    },
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!requestId) return;
    const channel = supabase
      .channel(`mrm-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'maintenance_request_messages',
          filter: `request_id=eq.${requestId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['maintenance-thread', requestId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, qc]);

  return query;
}

interface SendArgs {
  request_id: string;
  body: string;
  sender_role: ThreadSenderRole;
  sender_name?: string | null;
  message_type?: 'chat' | 'recommendation';
  recommendation?: { title: string; category: string } | null;
}

export function useSendMaintenanceMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SendArgs) => {
      const { error } = await supabase.from('maintenance_request_messages').insert({
        request_id: args.request_id,
        body: args.body,
        sender_role: args.sender_role,
        sender_name: args.sender_name ?? null,
        message_type: args.message_type ?? 'chat',
        recommendation: args.recommendation ?? null,
        // sender_user_id + org_id auto-filled by set_mrm_defaults_trg
      });
      if (error) throw error;

      // First maintenance-side message → bump request to acknowledged
      if (args.sender_role !== 'driver') {
        await supabase
          .from('maintenance_requests')
          .update({ status: 'acknowledged' })
          .eq('id', args.request_id)
          .eq('status', 'submitted');
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['maintenance-thread', vars.request_id] });
      qc.invalidateQueries({ queryKey: ['driver-fault-reports'] });
      qc.invalidateQueries({ queryKey: ['driver-maintenance-requests'] });
    },
  });
}
