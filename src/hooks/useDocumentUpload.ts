import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useStorageProvider } from './useStorageProvider';

type Document = Database['public']['Tables']['documents']['Row'];

interface UploadOptions {
  relatedType: string;
  relatedId: string;
  documentType: string;
}

export function useDocumentUpload() {
  const { orgId } = useAuth();
  const { upload, remove } = useStorageProvider();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const uploadDocument = async (file: File, options: UploadOptions) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const filePath = `${options.relatedType}/${options.relatedId}/${Date.now()}.${fileExt}`;

      // Upload through storage provider (Google Drive or built-in)
      const { path, error: uploadError } = await upload('documents', filePath, file);

      if (uploadError || !path) throw uploadError || new Error('Upload failed');

      const { error: dbError } = await supabase.from('documents').insert({
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        document_type: options.documentType,
        related_type: options.relatedType,
        related_id: options.relatedId,
        uploaded_by: user.id,
        org_id: orgId,
      });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['documents', options.relatedType, options.relatedId] });
      toast.success('Document uploaded successfully');
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = useMutation({
    mutationFn: async (doc: Document) => {
      // Delete file from storage provider
      if (doc.file_path) {
        await remove('documents', doc.file_path);
      }
      
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  return { uploadDocument, deleteDocument, uploading };
}

export function useDocuments(relatedType: string, relatedId?: string) {
  return useQuery({
    queryKey: ['documents', relatedType, relatedId],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select('*')
        .eq('related_type', relatedType)
        .order('created_at', { ascending: false });
      
      if (relatedId) {
        query = query.eq('related_id', relatedId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Document[];
    },
    enabled: !!relatedType,
  });
}
