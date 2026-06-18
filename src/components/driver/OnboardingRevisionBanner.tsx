import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface Props {
  driverId: string;
  credentialsStatus?: 'pending' | 'approved' | 'revision_requested' | null;
}

export function OnboardingRevisionBanner({ driverId, credentialsStatus }: Props) {
  const navigate = useNavigate();

  const { data: docRevisionCount = 0 } = useQuery({
    queryKey: ['onboarding-revisions', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('driver_signed_documents')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .eq('review_status', 'revision_requested');
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const hasCredentialsRevision = credentialsStatus === 'revision_requested';
  const totalRevisions = (hasCredentialsRevision ? 1 : 0) + docRevisionCount;
  if (totalRevisions === 0) return null;

  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border-2 border-destructive bg-destructive text-destructive-foreground px-4 py-3 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-bold leading-tight">Action Required</p>
          <p className="text-sm leading-snug opacity-95">
            Your onboarding requires a revision
            {totalRevisions > 1 ? ` on ${totalRevisions} items` : ''}. Please review and resubmit.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="bg-white text-destructive hover:bg-white/90 font-semibold shrink-0"
        onClick={() => navigate('/driver/onboarding?revision=1')}
      >
        View Details
      </Button>
    </div>
  );
}
