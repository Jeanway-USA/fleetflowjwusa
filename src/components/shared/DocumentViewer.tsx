import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Download, Loader2 } from 'lucide-react';
import { getFileUrl } from '@/hooks/useStorageProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DocumentViewerProps {
  storedPath: string;
  fileName: string;
  bucket?: string;
}

/**
 * Component to view and download documents from private storage buckets.
 * Supports both built-in storage and Google Drive via the storage proxy.
 */
export function DocumentViewer({ 
  storedPath, 
  fileName, 
  bucket = 'documents' 
}: DocumentViewerProps) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);

  const fetchBlob = async (url: string): Promise<Blob> => {
    // For gdrive proxy URLs we need to attach the auth token
    if (storedPath.startsWith('gdrive:')) {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(url, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      if (!resp.ok) throw new Error('Download failed');
      return resp.blob();
    }
    // Built-in signed URLs work without extra auth
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Download failed');
    return resp.blob();
  };

  const handleView = async () => {
    setLoading('view');
    try {
      const useProxy = storedPath.startsWith('gdrive:');
      const url = await getFileUrl(bucket, storedPath, useProxy);

      if (!url) {
        toast.error('Could not access document');
        return;
      }

      if (storedPath.startsWith('gdrive:')) {
        // Fetch blob and open in new tab to avoid leaking auth tokens in URL
        const blob = await fetchBlob(url);
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } else {
        window.open(url, '_blank');
      }
    } catch {
      toast.error('Failed to open document');
    } finally {
      setLoading(null);
    }
  };

  const handleDownload = async () => {
    setLoading('download');
    try {
      const useProxy = storedPath.startsWith('gdrive:');
      const url = await getFileUrl(bucket, storedPath, useProxy);

      if (!url) {
        toast.error('Could not access document');
        return;
      }

      const blob = await fetchBlob(url);
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
    } catch {
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
