import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { extractStoragePath, getSignedUrl } from './useSignedUrl';

interface StorageStatus {
  provider: 'built_in' | 'google_drive';
  is_active: boolean;
}

/**
 * Hook to get the org's storage provider status
 */
export function useStorageStatus() {
  const { orgId } = useAuth();

  return useQuery({
    queryKey: ['storage-status', orgId],
    queryFn: async (): Promise<StorageStatus> => {
      if (!orgId) return { provider: 'built_in', is_active: false };

      const { data, error } = await supabase
        .from('org_storage_config')
        .select('provider, is_active')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) {
        return { provider: 'built_in', is_active: false };
      }

      return {
        provider: (data.provider as 'built_in' | 'google_drive') || 'built_in',
        is_active: data.is_active,
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Upload a file through the storage proxy (supports Google Drive and built-in)
 */
export async function uploadFile(
  bucket: string,
  filePath: string,
  file: File | Blob,
  useProxy: boolean = false
): Promise<{ path: string; error: Error | null }> {
  // If not using proxy, use direct built-in storage
  if (!useProxy) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (error) return { path: '', error };
    return { path: filePath, error: null };
  }

  // Use proxy (handles Google Drive routing server-side)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', bucket);
    formData.append('path', filePath);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const resp = await fetch(`${supabaseUrl}/functions/v1/storage-proxy?action=upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Upload failed');
    }

    const result = await resp.json();
    return { path: result.path, error: null };
  } catch (err) {
    return { path: '', error: err as Error };
  }
}

/**
 * Get a viewable URL for a file (handles both Google Drive and built-in storage)
 */
export async function getFileUrl(
  bucket: string,
  fileRef: string | null | undefined,
  useProxy: boolean = false
): Promise<string | null> {
  if (!fileRef) return null;

  // Google Drive files: fetch a short-lived signed URL via proxy instead of leaking JWT in URL
  if (fileRef.startsWith('gdrive:')) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/storage-proxy?action=signed-url&fileRef=${encodeURIComponent(fileRef)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (!resp.ok) return null;
      const data = await resp.json();
      return data.url;
    } catch {
      return null;
    }
  }

  // Built-in storage: use existing signed URL logic
  if (!useProxy) {
    const storagePath = extractStoragePath(fileRef, bucket);
    return getSignedUrl(bucket, storagePath);
  }

  // Proxy mode for built-in
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/storage-proxy?action=signed-url&fileRef=${encodeURIComponent(fileRef)}&bucket=${bucket}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.url;
  } catch {
    return null;
  }
}

/**
 * Delete a file (handles both Google Drive and built-in storage)
 */
export async function deleteFile(
  bucket: string,
  fileRef: string,
  useProxy: boolean = false
): Promise<{ error: Error | null }> {
  if (fileRef.startsWith('gdrive:') || useProxy) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/storage-proxy?action=delete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileRef, bucket }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Delete failed');
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }

  // Direct built-in storage delete
  const { error } = await supabase.storage.from(bucket).remove([fileRef]);
  return { error: error as Error | null };
}

/**
 * React hook for the storage provider that gives upload/download/delete functions
 * aware of the org's configured provider
 */
export function useStorageProvider() {
  const { data: status } = useStorageStatus();
  const useProxy = status?.provider === 'google_drive' && status?.is_active;

  const upload = useCallback(
    (bucket: string, filePath: string, file: File | Blob) =>
      uploadFile(bucket, filePath, file, useProxy || false),
    [useProxy]
  );

  const getUrl = useCallback(
    (bucket: string, fileRef: string | null | undefined) =>
      getFileUrl(bucket, fileRef, useProxy || false),
    [useProxy]
  );

  const remove = useCallback(
    (bucket: string, fileRef: string) =>
      deleteFile(bucket, fileRef, useProxy || false),
    [useProxy]
  );

  return {
    upload,
    getUrl,
    remove,
    provider: status?.provider || 'built_in',
    isGoogleDrive: useProxy || false,
  };
}

/**
 * Hook to get a signed/proxied URL for a single file, provider-aware
 */
export function useProviderSignedUrl(
  bucket: string | null | undefined,
  storedPath: string | null | undefined
): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: status } = useStorageStatus();

  useEffect(() => {
    if (!bucket || !storedPath) {
      setUrl(null);
      return;
    }

    setLoading(true);
    const useProxy = status?.provider === 'google_drive' && status?.is_active;
    getFileUrl(bucket, storedPath, useProxy || false)
      .then(setUrl)
      .finally(() => setLoading(false));
  }, [bucket, storedPath, status?.provider, status?.is_active]);

  return { url, loading };
}
