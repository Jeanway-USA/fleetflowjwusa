import { supabase } from '@/integrations/supabase/client';
import type { EntryType, TimeOffEntry, TimeOffKind } from '@/lib/payroll/timeOff';

const db = supabase as any;

export const KIND_LABEL: Record<TimeOffKind, string> = { sick: 'Paid sick leave', pto: 'Paid time off', holiday: 'Holiday pay' };

export interface StoredEntry extends TimeOffEntry {
  user_id: string;
  created_at: string;
}

/**
 * A person's live ledger. Sick leave earned by a pay statement that was later archived (a draft made again) is not counted,
 * so regenerating pay never earns the same hours twice. Returns an empty ledger when the table is not set up yet.
 */
export async function fetchEntries(orgId: string, userId: string): Promise<StoredEntry[]> {
  const { data, error } = await db.from('time_off_entries').select('*').eq('org_id', orgId).eq('user_id', userId).is('archived_at', null).order('effective_date');
  if (error) return [];
  const rows = ((data ?? []) as any[]).map((r) => ({ ...r, hours: Number(r.hours) })) as StoredEntry[];
  const sources = Array.from(new Set(rows.filter((r) => r.entry_type === 'accrual' && r.source_id).map((r) => r.source_id as string)));
  if (sources.length === 0) return rows;
  const { data: live } = await db.from('staff_pay_statements').select('id').in('id', sources).is('archived_at', null);
  const liveIds = new Set(((live ?? []) as any[]).map((r) => r.id));
  return rows.filter((r) => r.entry_type !== 'accrual' || !r.source_id || liveIds.has(r.source_id));
}

export async function addEntry(args: { orgId: string; userId: string; createdBy: string | null; kind: TimeOffKind; type: EntryType; hours: number; date: string; note: string }): Promise<void> {
  const signed = args.type === 'use' ? -Math.abs(args.hours) : args.hours;
  const { error } = await db.from('time_off_entries').insert({
    org_id: args.orgId, user_id: args.userId, kind: args.kind, entry_type: args.type, hours: signed, effective_date: args.date, note: args.note.trim() || null, created_by: args.createdBy,
  });
  if (error) throw new Error(error.message);
}

/** Takes an entry out of the balance. It stays on record. */
export async function archiveEntry(id: string): Promise<void> {
  const { error } = await db.from('time_off_entries').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function recordAccrual(args: { orgId: string; userId: string; statementId: string; kind: TimeOffKind; hours: number; periodEnd: string; note: string }): Promise<void> {
  if (!(args.hours > 0)) return;
  const { error } = await db.from('time_off_entries').insert({
    org_id: args.orgId, user_id: args.userId, kind: args.kind, entry_type: 'accrual', hours: args.hours, effective_date: args.periodEnd, source_id: args.statementId, note: args.note,
  });
  if (error && error.code !== '23505') throw new Error(error.message);
}
