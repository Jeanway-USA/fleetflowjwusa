import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TrustLevel = 'trusted' | 'neutral' | 'risky';

export interface AgentTrustScore {
  level: TrustLevel;
  totalInteractions: number;
  negativeFlags: number;
  label: string;
}

const NEGATIVE_KEYWORDS = ['bait', 'switch', 'ghost', 'load gone', 'no answer', 'unreliable', 'flag'];

export function useAgentTrustScore(agencyCode: string | null | undefined) {
  return useQuery({
    queryKey: ['agent-trust-score', agencyCode],
    queryFn: async (): Promise<AgentTrustScore> => {
      if (!agencyCode) {
        return { level: 'neutral', totalInteractions: 0, negativeFlags: 0, label: 'No History' };
      }

      // Find matching CRM contacts by agent code or company name
      const { data: contacts } = await supabase
        .from('crm_contacts')
        .select('id')
        .or(`agent_code.eq.${agencyCode},company_name.ilike.%${agencyCode}%`)
        .limit(5);

      if (!contacts?.length) {
        return { level: 'neutral', totalInteractions: 0, negativeFlags: 0, label: 'No History' };
      }

      const contactIds = contacts.map(c => c.id);
      
      const { data: activities } = await supabase
        .from('crm_activities')
        .select('subject, description, activity_type')
        .in('contact_id', contactIds)
        .order('activity_date', { ascending: false })
        .limit(100);

      const total = activities?.length || 0;
      if (total === 0) {
        return { level: 'neutral', totalInteractions: 0, negativeFlags: 0, label: 'No History' };
      }

      const negatives = (activities || []).filter(a => {
        const text = `${a.subject} ${a.description || ''} ${a.activity_type}`.toLowerCase();
        return NEGATIVE_KEYWORDS.some(kw => text.includes(kw));
      }).length;

      const ratio = negatives / total;
      let level: TrustLevel = 'trusted';
      let label = 'Reliable';

      if (ratio > 0.3) {
        level = 'risky';
        label = 'High Risk';
      } else if (ratio > 0.1 || total < 3) {
        level = 'neutral';
        label = total < 3 ? 'Limited History' : 'Caution';
      }

      return { level, totalInteractions: total, negativeFlags: negatives, label };
    },
    enabled: !!agencyCode,
    staleTime: 5 * 60 * 1000,
  });
}
