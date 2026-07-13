import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TaxDocument {
  id: string;
  org_id: string;
  driver_id: string;
  tax_year: number;
  file_path: string;
  uploaded_by: string | null;
  created_at: string;
}

const BUCKET = 'tax-documents';

/** Admin/dispatcher: list tax documents for a given driver (by drivers.id). */
export function useTaxDocuments(driverId: string | null | undefined) {
  return useQuery({
    queryKey: ['tax-documents', driverId],
    enabled: !!driverId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_documents')
        .select('*')
        .eq('driver_id', driverId as string)
        .order('tax_year', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaxDocument[];
    },
  });
}

/** Driver: list own tax documents by resolving their drivers.id from auth user. */
export function useMyTaxDocuments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tax-documents', 'me', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: driverRow, error: dErr } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (dErr) throw dErr;
      const driverId = (driverRow as { id?: string } | null)?.id;
      if (!driverId) return [] as TaxDocument[];

      const { data, error } = await supabase
        .from('tax_documents')
        .select('*')
        .eq('driver_id', driverId)
        .order('tax_year', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaxDocument[];
    },
  });
}

interface UploadArgs {
  driverId: string;
  taxYear: number;
  file: File;
}

export function useUploadTaxDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ driverId, taxYear, file }: UploadArgs) => {
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF files are allowed');
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File must be 10 MB or smaller');
      }
      const id = crypto.randomUUID();
      const path = `${driverId}/${taxYear}/${id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('tax_documents').insert({
        driver_id: driverId,
        tax_year: taxYear,
        file_path: path,
      } as any);
      if (dbErr) {
        // best effort cleanup
        await supabase.storage.from(BUCKET).remove([path]);
        throw dbErr;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tax-documents', vars.driverId] });
      toast.success('1099 uploaded');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Upload failed'),
  });
}

export function useDeleteTaxDocument(driverId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: TaxDocument) => {
      await supabase.storage.from(BUCKET).remove([doc.file_path]);
      const { error } = await supabase.from('tax_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-documents', driverId] });
      toast.success('Document deleted');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Delete failed'),
  });
}

/** Generate signed URL and trigger a browser download. */
export async function downloadTaxDocument(filePath: string, fileName: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('Could not generate download link');
  }
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
