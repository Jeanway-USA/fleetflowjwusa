import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SignedImage } from '@/components/shared/SignedImage';
import { Skeleton } from '@/components/ui/skeleton';
import { FileCheck, ExternalLink, Image } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface PODViewerProps {
  loadId: string;
}

export function PODViewer({ loadId }: PODViewerProps) {
  const { data: podDocs = [], isLoading } = useQuery({
    queryKey: ['pod_documents', loadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('related_type', 'load')
        .eq('related_id', loadId)
        .in('document_type', ['pod_signature', 'transflo_pod'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!loadId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (podDocs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No Proof of Delivery captured yet.</p>
        <p className="text-sm mt-1">POD documents will appear here after delivery confirmation.</p>
      </div>
    );
  }

  const signatures = podDocs.filter(d => d.document_type === 'pod_signature');
  const transfloLinks = podDocs.filter(d => d.document_type === 'transflo_pod');

  return (
    <div className="space-y-6">
      {signatures.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Image className="h-4 w-4" /> Receiver Signature
          </h4>
          {signatures.map(sig => (
            <div key={sig.id} className="border rounded-lg p-4 bg-card space-y-2">
              <SignedImage
                bucket="dvir-photos"
                storedPath={sig.file_path}
                alt="POD Signature"
                className="w-full max-w-md h-auto rounded border bg-white"
                fallback={<p className="text-sm text-muted-foreground">Unable to load signature image</p>}
              />
              <p className="text-xs text-muted-foreground">
                Captured {format(parseISO(sig.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          ))}
        </div>
      )}

      {transfloLinks.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <ExternalLink className="h-4 w-4" /> Transflo POD
          </h4>
          {transfloLinks.map(doc => (
            <div key={doc.id} className="border rounded-lg p-4 bg-card space-y-2">
              <a
                href={doc.file_path}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {doc.file_path}
              </a>
              <p className="text-xs text-muted-foreground">
                Added {format(parseISO(doc.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
