import { supabase } from '@/integrations/supabase/client';
import { getSignedUrl } from '@/hooks/useSignedUrl';
import type { FileInput } from '@/lib/safety/compliance';

const db = supabase as any;
const BUCKET = 'documents';

export type SubjectType = 'driver' | 'truck' | 'trailer' | 'company';
export type FileKind = 'mvr' | 'medical_card' | 'landstar_approval' | 'training' | 'inspection_report' | 'accident_report' | 'other';

export interface SafetyFile extends FileInput {
  id: string;
  subject_type: SubjectType;
  file_path: string;
  note: string | null;
  created_at: string;
}

export const KIND_LABEL: Record<FileKind, string> = {
  mvr: 'MVR', medical_card: 'Medical card', landstar_approval: 'Landstar approval', training: 'Training certificate',
  inspection_report: 'Inspection report', accident_report: 'Accident report', other: 'Other',
};

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Live files, newest first. Returns an empty list when the table is not set up yet. */
export async function fetchSafetyFiles(): Promise<{ files: SafetyFile[]; ready: boolean }> {
  const { data, error } = await db.from('safety_files').select('*').is('archived_at', null).order('created_at', { ascending: false });
  if (error) return { files: [], ready: false };
  return { files: (data ?? []) as SafetyFile[], ready: true };
}

/** Pure: why a file cannot be added, or null when it is fine. */
export function fileProblem(file: { size: number; type: string; name: string }): string | null {
  if (!ALLOWED.includes(file.type)) return 'Upload a PDF or a photo (JPG, PNG or WebP).';
  if (file.size > MAX_BYTES) return 'That file is over 15 MB. Make it smaller and try again.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/**
 * Saves a file for a driver, truck or trailer. A new file of the same kind does not replace the old one: the old one is
 * archived, so every MVR ever uploaded stays on record.
 */
export async function uploadSafetyFile(args: { orgId: string; userId: string | null; subjectType: SubjectType; subjectId: string; kind: FileKind; file: File; docDate: string | null; note?: string }): Promise<void> {
  const problem = fileProblem(args.file);
  if (problem) throw new Error(problem);
  const ext = (args.file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${args.orgId}/safety/${args.subjectType}/${args.subjectId}/${args.kind}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, args.file, { contentType: args.file.type });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await db.from('safety_files').insert({
    org_id: args.orgId, subject_type: args.subjectType, subject_id: args.subjectId, kind: args.kind,
    file_name: args.file.name, file_path: path, file_size: args.file.size, doc_date: args.docDate || null, note: args.note?.trim() || null, uploaded_by: args.userId,
  });
  if (error) {
    // The record failed, so take the file back out rather than leave it orphaned.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  // Archive earlier files of this kind. They stay on record.
  await db.from('safety_files').update({ archived_at: new Date().toISOString() }).eq('org_id', args.orgId).eq('subject_type', args.subjectType).eq('subject_id', args.subjectId).eq('kind', args.kind).neq('file_path', path).is('archived_at', null);
}

export async function openSafetyFile(path: string): Promise<void> {
  const url = await getSignedUrl(BUCKET, path, 300);
  if (!url) throw new Error('Could not open the file.');
  window.open(url, '_blank', 'noopener');
}
