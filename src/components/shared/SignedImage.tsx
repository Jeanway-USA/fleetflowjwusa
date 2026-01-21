import { useState, useEffect } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Skeleton } from '@/components/ui/skeleton';

interface SignedImageProps {
  bucket: string;
  storedPath: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Component to display images from private storage buckets using signed URLs
 */
export function SignedImage({ 
  bucket, 
  storedPath, 
  alt, 
  className = '',
  fallback
}: SignedImageProps) {
  const { url, loading } = useSignedUrl(bucket, storedPath);
  
  if (loading) {
    return <Skeleton className={className} />;
  }
  
  if (!url) {
    return fallback ? <>{fallback}</> : null;
  }
  
  return (
    <img 
      src={url} 
      alt={alt} 
      className={className}
    />
  );
}

interface SignedLinkProps {
  bucket: string;
  storedPath: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  download?: string;
}

/**
 * Component to create download/view links for files in private storage buckets
 */
export function SignedLink({
  bucket,
  storedPath,
  children,
  className = '',
  download
}: SignedLinkProps) {
  const { url, loading } = useSignedUrl(bucket, storedPath);
  const [clicked, setClicked] = useState(false);
  
  const handleClick = async (e: React.MouseEvent) => {
    if (!url) {
      e.preventDefault();
      return;
    }
    
    if (download) {
      e.preventDefault();
      setClicked(true);
      
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = download;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(blobUrl);
      } finally {
        setClicked(false);
      }
    }
  };
  
  if (loading || clicked) {
    return (
      <span className={className} style={{ opacity: 0.5, cursor: 'wait' }}>
        {children}
      </span>
    );
  }
  
  if (!url) {
    return (
      <span className={className} style={{ opacity: 0.5 }}>
        {children}
      </span>
    );
  }
  
  return (
    <a 
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
