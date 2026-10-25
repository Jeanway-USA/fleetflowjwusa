import { supabase } from '@/integrations/supabase/client';

export type ReviewStatus = 'pending' | 'approved' | 'revision_requested';

export interface SignedDocRow {
  id: string;
  driver_id: string;
  document_type: string;
  file_path: string;
  admin_file_path: string | null;
  attachment_file_path: string | null;
  signed_at: string;
  review_status: ReviewStatus;
  revision_notes: string | null;
  reviewed_at: string | null;
  archived_at: string | null;
  drivers: { first_name: string | null; last_name: string | null; status: string | null } | null;
}

/**
 * Only the newest signed copy of each document a driver has signed is ever up for review. Older copies were replaced
 * when the driver signed again, so they must not count as waiting.
 */
export function latestPerType<T extends { driver_id: string; document_type: string; signed_at: string }>(rows: T[]): T[] {
  const newest = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.driver_id}|${r.document_type}`;
    const have = newest.get(key);
    if (!have || r.signed_at > have.signed_at) newest.set(key, r);
  }
  return [...newest.values()];
}

export async function fetchSignedDocs(): Promise<SignedDocRow[]> {
  const { data, error } = await supabase
    .from('driver_signed_documents')
    .select('id, driver_id, document_type, file_path, admin_file_path, attachment_file_path, signed_at, review_status, revision_notes, reviewed_at, archived_at' as never)
    .order('signed_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  const all = (data ?? []) as unknown as SignedDocRow[];
  // Archived copies are kept apart: they are never the one up for review.
  const latest = [...latestPerType(all.filter((d) => !d.archived_at)), ...all.filter((d) => d.archived_at)];
  // The two tables are not linked in the database, so the names are fetched on their own and matched here.
  const ids = [...new Set(latest.map((d) => d.driver_id))];
  const names = new Map<string, SignedDocRow['drivers']>();
  if (ids.length > 0) {
    const { data: drivers, error: dErr } = await supabase.from('drivers').select('id, first_name, last_name, status').in('id', ids);
    if (dErr) throw dErr;
    for (const d of drivers ?? []) names.set(d.id, { first_name: d.first_name, last_name: d.last_name, status: d.status });
  }
  return latest.map((d) => ({ ...d, drivers: names.get(d.driver_id) ?? null }));
}

/** How many documents are waiting for someone to look at them. */
export async function countAwaitingReview(orgId: string): Promise<number> {
  const { data, error } = await supabase
    .from('driver_signed_documents')
    .select('driver_id, document_type, signed_at, review_status' as never)
    .eq('org_id', orgId)
    .is('archived_at', null)
    .order('signed_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return latestPerType((data ?? []) as unknown as Array<{ driver_id: string; document_type: string; signed_at: string; review_status: ReviewStatus }>).filter((r) => r.review_status === 'pending').length;
}
