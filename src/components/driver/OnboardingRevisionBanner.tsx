import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchOutstandingTemplates } from '@/lib/onboarding/outstanding';
import { DBtn } from '@/components/driver/ui/driver-ui';

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
      const { data, error } = await supabase
        .from('driver_signed_documents')
        .select('document_type, review_status, signed_at')
        .eq('driver_id', driverId)
        .order('signed_at', { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      let count = 0;
      for (const row of (data ?? []) as Array<{ document_type: string; review_status: string }>) {
        if (seen.has(row.document_type)) continue;
        seen.add(row.document_type);
        if (row.review_status === 'revision_requested') count += 1;
      }
      return count;
    },
    refetchInterval: 60_000,
  });

  const { data: outstandingCount = 0 } = useQuery({
    queryKey: ['onboarding-outstanding', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const res = await fetchOutstandingTemplates(driverId);
      return res.templates.length;
    },
    refetchInterval: 60_000,
  });

  const hasCredentialsRevision = credentialsStatus === 'revision_requested';
  const revisionTotal = (hasCredentialsRevision ? 1 : 0) + docRevisionCount;
  const total = revisionTotal + outstandingCount;
  if (total === 0) return null;

  // If the only work is unsigned templates (no revision requests), deep-link
  // to the docs-only mode; otherwise use the standard revision flow.
  const targetHref = revisionTotal === 0 ? '/driver/onboarding?docs=1' : '/driver/onboarding?revision=1';

  const message =
    revisionTotal > 0
      ? `Your onboarding needs a revision${total > 1 ? ` on ${total} items` : ''}. Review it and send it again.`
      : outstandingCount === 1
        ? 'You have 1 document that still needs your signature.'
        : `You have ${outstandingCount} documents that still need your signature.`;

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg bg-destructive px-4 py-3 text-destructive-foreground sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Action required</p>
          <p className="text-sm leading-snug">{message}</p>
        </div>
      </div>
      <DBtn tone="secondary" size="md" className="shrink-0 border-transparent bg-white text-destructive hover:bg-white/90" onClick={() => navigate(targetHref)}>
        {revisionTotal > 0 ? 'View details' : 'Sign documents'}
      </DBtn>
    </div>
  );
}
