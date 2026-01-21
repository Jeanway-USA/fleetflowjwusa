import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Download, Loader2 } from 'lucide-react';
import { getSignedUrl, extractStoragePath } from '@/hooks/useSignedUrl';
import { toast } from 'sonner';

interface DocumentViewerProps {
  storedPath: string;
  fileName: string;
  bucket?: string;
}

/**
 * Component to view and download documents from private storage buckets
 */
export function DocumentViewer({ 
  storedPath, 
  fileName, 
  bucket = 'documents' 
}: DocumentViewerProps) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);
  
  const handleView = async () => {
    setLoading('view');
    try {
      const filePath = extractStoragePath(storedPath, bucket) || storedPath;
      const signedUrl = await getSignedUrl(bucket, filePath);
      
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      } else {
        toast.error('Could not access document');
      }
    } catch (error) {
      toast.error('Failed to open document');
    } finally {
      setLoading(null);
    }
  };
  
  const handleDownload = async () => {
    setLoading('download');
    try {
      const filePath = extractStoragePath(storedPath, bucket) || storedPath;
      const signedUrl = await getSignedUrl(bucket, filePath);
      
      if (!signedUrl) {
        toast.error('Could not access document');
        return;
      }
      
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('Failed to download document');
    } finally {
      setLoading(null);
    }
  };
  
  return (
    <div className="flex gap-1">
      <Button 
        size="icon" 
        variant="ghost" 
        onClick={handleView}
        disabled={!!loading}
        title="View"
      >
        {loading === 'view' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </Button>
      <Button 
        size="icon" 
        variant="ghost" 
        onClick={handleDownload}
        disabled={!!loading}
        title="Download"
      >
        {loading === 'download' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
