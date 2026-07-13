import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, Bell, CheckCircle2, Download, Eye, FileSignature, Loader2, ShieldAlert, ShieldCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RequestRevisionDialog } from './RequestRevisionDialog';
import { fetchOutstandingTemplates } from '@/lib/onboarding/outstanding';
import { regenerateAdminPdf, isRegenerable } from '@/lib/onboarding/regenerateAdminPdf';

const DOCUMENT_LABELS: Record<string, string> = {
  driver_agreement: 'Driver Agreement',
  direct_deposit: 'Direct Deposit Authorization',
  direct_deposit_form: 'Direct Deposit Authorization (Form)',
  w4: 'Federal W-4 Withholding',
  i9: 'Form I-9 — Employment Eligibility',
  w9: 'Form W-9 — Taxpayer Identification',
  ioo_agreement: 'Independent Owner-Operator Agreement',
  state_tax: 'State Tax Withholding',
};

type ReviewStatus = 'pending' | 'approved' | 'revision_requested';

interface Props {
  driverId: string;
}

export function SignedOnboardingDocuments({ driverId }: Props) {
  const { isOwner, hasRole, user } = useAuth();
  const canView = isOwner || hasRole('safety') || hasRole('payroll_admin');
  const canReview = isOwner || hasRole('payroll_admin') || hasRole('safety');
  const canDownloadFull = isOwner || hasRole('payroll_admin');
  const queryClient = useQueryClient();
  const [revisionTarget, setRevisionTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ['driver_signed_documents', driverId],
    enabled: canView && !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_signed_documents')
        .select('id, document_type, file_path, admin_file_path, attachment_file_path, signed_at, review_status, revision_notes, reviewed_at' as never)
        .eq('driver_id', driverId)
        .order('signed_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<{
        id: string;
        document_type: string;
        file_path: string;
        admin_file_path: string | null;
        attachment_file_path: string | null;
        signed_at: string;
        review_status: ReviewStatus;
        revision_notes: string | null;
        reviewed_at: string | null;
      }>;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (args: { id: string; status: ReviewStatus; notes: string | null }) => {
      const { error } = await supabase
        .from('driver_signed_documents')
        .update({
          review_status: args.status,
          revision_notes: args.notes,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver_signed_documents', driverId] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-revisions'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update review'),
  });

  const { data: outstandingData, isLoading: outstandingLoading } = useQuery({
    queryKey: ['onboarding-outstanding-admin', driverId],
    enabled: canView && !!driverId,
    queryFn: () => fetchOutstandingTemplates(driverId),
  });
  const outstanding = outstandingData?.templates ?? [];

  const notifyMutation = useMutation({
    mutationFn: async (tmpl: { document_type: string; name: string | null }) => {
      const label = tmpl.name ?? tmpl.document_type;
      const { error } = await supabase.from('driver_notifications').insert({
        driver_id: driverId,
        org_id: outstandingData?.orgId ?? null,
        notification_type: 'document_request',
        title: 'Document signature requested',
        message: `Your administrator asked you to sign: ${label}. Open the onboarding page from your dashboard to complete it.`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Driver notified. A prompt will show on their dashboard.');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to notify driver'),
  });

  if (!canView) return null;

  const openSignedUrl = async (filePath: string, downloadName: string, mode: 'preview' | 'download') => {
    const { data, error } = await supabase.storage
      .from('signed-documents')
      .createSignedUrl(filePath, 300, mode === 'download' ? { download: downloadName } : undefined);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? 'Could not open document');
      return;
    }
    if (mode === 'preview') {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } else {
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  if (isLoading || outstandingLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  // Dedupe by document_type — only show the latest per type for actions
  const latestByType = new Map<string, NonNullable<typeof docs>[number]>();
  for (const d of docs ?? []) {
    if (!latestByType.has(d.document_type)) latestByType.set(d.document_type, d);
  }

  const outstandingSection = outstanding.length > 0 ? (
    <div className="rounded-md border-2 border-amber-500/50 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <p className="font-semibold text-sm">Outstanding documents ({outstanding.length})</p>
      </div>
      <p className="text-xs text-muted-foreground">
        These active templates have never been signed by this driver. Notify them to complete the missing paperwork.
      </p>
      <div className="space-y-2 pt-1">
        {outstanding.map((t) => {
          const friendly = t.name ?? DOCUMENT_LABELS[t.document_type] ?? t.document_type;
          return (
          <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border bg-background p-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <FileSignature className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{friendly}</span>
              {t.builtin ? (
                <Badge variant="outline" className="text-[10px] uppercase">Built-in</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {t.applies_to === 'shared' ? 'All' : t.applies_to === 'w2' ? 'W-2' : '1099'}
                </Badge>
              )}
            </div>
            {canReview && (
              <Button
                size="sm"
                variant="outline"
                disabled={notifyMutation.isPending}
                onClick={() => notifyMutation.mutate({ document_type: t.document_type, name: friendly })}
              >
                {notifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Bell className="h-4 w-4 mr-1.5" />
                )}
                Notify driver
              </Button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  ) : null;

  if ((!docs || docs.length === 0) && outstanding.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        <FileSignature className="mx-auto mb-2 h-6 w-6 opacity-60" />
        No signed onboarding documents yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Admin view
      </div>

      {outstandingSection}


      {(docs ?? []).map((d) => {
        const label = DOCUMENT_LABELS[d.document_type] ?? d.document_type;
        const isLatest = latestByType.get(d.document_type)?.id === d.id;
        const status: ReviewStatus = d.review_status ?? 'pending';
        return (
          <div key={d.id} className="rounded-md border p-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{label}</p>
                  <StatusPill status={status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Signed {format(new Date(d.signed_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  // Privileged roles always get the unmasked artifact when one exists on disk.
                  const previewPath = canDownloadFull && d.admin_file_path ? d.admin_file_path : d.file_path;
                  const downloadPath = previewPath;
                  const downloadName = canDownloadFull && d.admin_file_path ? `${d.document_type}_full.pdf` : `${d.document_type}.pdf`;
                  return (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openSignedUrl(previewPath, downloadName, 'preview')}>
                        <Eye className="mr-1.5 h-4 w-4" />
                        Preview
                      </Button>
                      <Button size="sm" onClick={() => openSignedUrl(downloadPath, downloadName, 'download')}>
                        <Download className="mr-1.5 h-4 w-4" />
                        Download
                      </Button>
                    </>
                  );
                })()}
                {canDownloadFull && !d.admin_file_path && isRegenerable(d.document_type) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Regenerate an unmasked payroll/tax copy from stored data"
                    onClick={async () => {
                      try {
                        const result = await regenerateAdminPdf(driverId, d.document_type);
                        if (!result) {
                          toast.error('Cannot regenerate this document type.');
                          return;
                        }
                        const url = URL.createObjectURL(result.blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = result.filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Failed to regenerate PDF');
                      }
                    }}
                  >
                    <ShieldCheck className="mr-1.5 h-4 w-4" />
                    Unmasked PDF
                  </Button>
                )}
                {d.attachment_file_path && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const ext = d.attachment_file_path!.split('.').pop() || 'bin';
                      openSignedUrl(d.attachment_file_path!, `${d.document_type}_attachment.${ext}`, 'download');
                    }}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    Attachment
                  </Button>
                )}
              </div>
            </div>

            {status === 'revision_requested' && d.revision_notes && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                <span className="font-semibold">Revision requested: </span>{d.revision_notes}
              </div>
            )}

            {canReview && isLatest && (
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60 mt-1">
                {status !== 'approved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ id: d.id, status: 'approved', notes: null })}
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
                    onClick={() => setRevisionTarget({ id: d.id, label })}
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
                    onClick={() => reviewMutation.mutate({ id: d.id, status: 'pending', notes: null })}
                  >
                    <Undo2 className="h-4 w-4 mr-1.5" />
                    Unmark
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <RequestRevisionDialog
        open={!!revisionTarget}
        onOpenChange={(o) => { if (!o) setRevisionTarget(null); }}
        itemLabel={revisionTarget?.label ?? ''}
        onConfirm={async (notes) => {
          if (!revisionTarget) return;
          await reviewMutation.mutateAsync({ id: revisionTarget.id, status: 'revision_requested', notes });
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
