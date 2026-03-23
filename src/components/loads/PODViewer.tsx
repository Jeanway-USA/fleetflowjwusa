import { SignedImage } from '@/components/shared/SignedImage';
import { FileCheck, ExternalLink, Image } from 'lucide-react';

interface PODViewerProps {
  podSignaturePath: string | null | undefined;
  podTransfloLink: string | null | undefined;
}

export function PODViewer({ podSignaturePath, podTransfloLink }: PODViewerProps) {
  const hasSignature = !!podSignaturePath;
  const hasTransflo = !!podTransfloLink;

  if (!hasSignature && !hasTransflo) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No Proof of Delivery captured yet.</p>
        <p className="text-sm mt-1">POD will appear here after delivery confirmation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasSignature && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Image className="h-4 w-4" /> Receiver Signature
          </h4>
          <div className="border rounded-lg p-4 bg-card">
            <SignedImage
              bucket="dvir-photos"
              storedPath={podSignaturePath}
              alt="POD Signature"
              className="w-full max-w-md h-auto rounded border bg-white"
              fallback={<p className="text-sm text-muted-foreground">Unable to load signature image</p>}
            />
          </div>
        </div>
      )}

      {hasTransflo && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <ExternalLink className="h-4 w-4" /> Transflo POD
          </h4>
          <div className="border rounded-lg p-4 bg-card">
            <a
              href={podTransfloLink!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {podTransfloLink}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
