import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to generate signed URLs for private storage buckets
 * Now that buckets are private, we need signed URLs to access files
 */

// Cache for signed URLs to avoid regenerating them unnecessarily
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_BUFFER = 60 * 1000; // Refresh 1 minute before expiry

/**
 * Extracts the storage path from a stored URL (either old public URL or new storage path)
 */
export function extractStoragePath(storedPath: string, bucket: string): string | null {
  if (!storedPath) return null;
  
  // If it's already a relative path (new format), return as-is
  if (!storedPath.startsWith('http')) {
    return storedPath;
  }
  
  // Extract from old public URL format: .../storage/v1/object/public/{bucket}/{path}
  const publicPattern = `/storage/v1/object/public/${bucket}/`;
  const publicIndex = storedPath.indexOf(publicPattern);
  if (publicIndex !== -1) {
    return storedPath.slice(publicIndex + publicPattern.length);
  }
  
  // Extract from signed URL format: .../storage/v1/object/sign/{bucket}/{path}?token=...
  const signedPattern = `/storage/v1/object/sign/${bucket}/`;
  const signedIndex = storedPath.indexOf(signedPattern);
  if (signedIndex !== -1) {
    const pathWithToken = storedPath.slice(signedIndex + signedPattern.length);
    return pathWithToken.split('?')[0]; // Remove query params
  }
  
  return null;
}

/**
 * Generate a signed URL for a file in a private bucket
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @param expiresIn - Expiry time in seconds (default: 1 hour)
 */
export async function getSignedUrl(
  bucket: string,
  path: string | null,
  expiresIn: number = 3600
): Promise<string | null> {
  if (!path) return null;
  
  const cacheKey = `${bucket}:${path}`;
  const now = Date.now();
  
  // Check cache first
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now + CACHE_BUFFER) {
    return cached.url;
  }
  
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    
    if (error || !data?.signedUrl) {
      console.error('Failed to create signed URL:', error);
      return null;
    }
    
    // Cache the signed URL
    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: now + (expiresIn * 1000),
    });
    
    return data.signedUrl;
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return null;
  }
}

/**
 * Hook to get a signed URL for a single file
 */
export function useSignedUrl(
  bucket: string | null | undefined,
  storedPath: string | null | undefined,
  expiresIn: number = 3600
): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!bucket || !storedPath) {
      setUrl(null);
      return;
    }
    
    const filePath = extractStoragePath(storedPath, bucket);
    if (!filePath) {
      setUrl(null);
      return;
    }
    
    setLoading(true);
    getSignedUrl(bucket, filePath, expiresIn)
      .then(signedUrl => {
        setUrl(signedUrl);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [bucket, storedPath, expiresIn]);
  
  return { url, loading };
}

/**
 * Hook to get signed URLs for multiple files
 */
export function useSignedUrls(
  bucket: string,
  storedPaths: (string | null | undefined)[],
  expiresIn: number = 3600
): { urls: (string | null)[]; loading: boolean } {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!storedPaths.length) {
      setUrls([]);
      return;
    }
    
    setLoading(true);
    
    Promise.all(
      storedPaths.map(async (storedPath) => {
        if (!storedPath) return null;
        const filePath = extractStoragePath(storedPath, bucket);
        return getSignedUrl(bucket, filePath, expiresIn);
      })
    ).then(signedUrls => {
      setUrls(signedUrls);
      setLoading(false);
    });
  }, [bucket, JSON.stringify(storedPaths), expiresIn]);
  
  return { urls, loading };
}

/**
 * Upload a file and return the storage path (not the public URL)
 * This is the new preferred method for uploads
 */
export async function uploadToStorage(
  bucket: string,
  filePath: string,
  file: File | Blob,
  options?: { contentType?: string }
): Promise<{ path: string | null; error: Error | null }> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, options);
    
    if (error) {
      return { path: null, error };
    }
    
    // Return just the path, not a public URL
    return { path: filePath, error: null };
  } catch (err) {
    return { path: null, error: err as Error };
  }
}
