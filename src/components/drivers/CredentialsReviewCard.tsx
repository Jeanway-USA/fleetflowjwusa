import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, Undo2, UserCog } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RequestRevisionDialog } from './RequestRevisionDialog';

type ReviewStatus = 'pending' | 'approved' | 'revision_requested';

interface Props {
  driverId: string;
  status: ReviewStatus;
  notes: string | null;
}

export function CredentialsReviewCard({ driverId, status, notes }: Props) {
  const { isOwner, hasRole, user } = useAuth();
  const canReview = isOwner || hasRole('payroll_admin') || hasRole('safety');
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const reviewMutation = useMutation({
    mutationFn: async (args: { status: ReviewStatus; notes: string | null }) => {
      const { error } = await supabase
        .from('drivers')
        .update({
          credentials_review_status: args.status,
          credentials_revision_notes: args.notes,
          credentials_reviewed_by: user?.id ?? null,
          credentials_reviewed_at: new Date().toISOString(),
        } as never)
        .eq('id', driverId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['driver-for-user'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-revisions'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update review'),
  });

  if (!canReview) return null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" />
          <p className="font-medium text-sm">Driver Profile &amp; Credentials</p>
          <StatusPill status={status} />
        </div>
      </div>

      {status === 'revision_requested' && notes && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <span className="font-semibold">Revision requested: </span>{notes}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {status !== 'approved' && (
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ status: 'approved', notes: null })}
          >
            {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Approve
          </Button>
        )}
        {status !== 'revision_requested' && (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/60 text-destructive hover:bg-destructive/10"
            disabled={reviewMutation.isPending}
            onClick={() => setDialogOpen(true)}
          >
            <ShieldAlert className="h-4 w-4 mr-1.5" />
            Request Revision
          </Button>
        )}
        {status === 'approved' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ status: 'pending', notes: null })}
          >
            <Undo2 className="h-4 w-4 mr-1.5" />
            Unmark
          </Button>
        )}
      </div>

      <RequestRevisionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        itemLabel="Driver Profile & Credentials"
        onConfirm={async (notes) => {
          await reviewMutation.mutateAsync({ status: 'revision_requested', notes });
          toast.success('Revision requested. The driver will be notified.');
        }}
      />
    </div>
  );
}

function StatusPill({ status }: { status: ReviewStatus }) {
  if (status === 'approved') {
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">Approved</Badge>;
  }
  if (status === 'revision_requested') {
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">Revision requested</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px]">Pending review</Badge>;
}

export { ShieldCheck };
