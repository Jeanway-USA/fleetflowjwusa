import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Eye, FileSignature, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const DOCUMENT_LABELS: Record<string, string> = {
  driver_agreement: 'Driver Agreement',
  direct_deposit: 'Direct Deposit Authorization',
};

interface Props {
  driverId: string;
}

export function SignedOnboardingDocuments({ driverId }: Props) {
  const { isOwner, hasRole } = useAuth();
  const canView = isOwner || hasRole('safety') || hasRole('payroll_admin');

  const { data: docs, isLoading } = useQuery({
    queryKey: ['driver_signed_documents', driverId],
    enabled: canView && !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_signed_documents')
        .select('id, document_type, file_path, attachment_file_path, signed_at')
        .eq('driver_id', driverId)
        .order('signed_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Defense-in-depth: hide entirely for non-admins
  if (!canView) return null;


  const openSignedUrl = async (
    filePath: string,
    downloadName: string,
    mode: 'preview' | 'download',
  ) => {
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


  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (!docs || docs.length === 0) {
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

      {docs.map((d) => {
        const label = DOCUMENT_LABELS[d.document_type] ?? d.document_type;
        return (
          <div
            key={d.id}
            className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">
                Signed {format(new Date(d.signed_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openSignedUrl(d.file_path, `${d.document_type}.pdf`, 'preview')}
              >
                <Eye className="mr-1.5 h-4 w-4" />
                Preview
              </Button>
              <Button
                size="sm"
                onClick={() => openSignedUrl(d.file_path, `${d.document_type}.pdf`, 'download')}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </Button>
              {d.attachment_file_path && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const ext = d.attachment_file_path!.split('.').pop() || 'bin';
                    openSignedUrl(
                      d.attachment_file_path!,
                      `${d.document_type}_attachment.${ext}`,
                      'download',
                    );
                  }}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Attachment
                </Button>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}
