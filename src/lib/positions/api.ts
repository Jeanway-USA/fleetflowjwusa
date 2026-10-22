import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_POSITIONS } from '@/lib/positions/defaults';
import type { Position, PositionAssignment, PositionDraft } from '@/lib/positions/types';

// The position tables are new, so they are not in the generated database types yet.
const db = supabase as any;
const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const clean = (row: any): Position => ({
  ...row,
  default_permissions: row.default_permissions ?? [],
  required_documents: row.required_documents ?? [],
  onboarding_checklist: row.onboarding_checklist ?? [],
});

export async function fetchPositions(): Promise<Position[]> {
  const { data, error } = await db.from('positions').select('*').order('sort_order', { ascending: true }).order('name');
  fail(error);
  return ((data ?? []) as any[]).map(clean);
}

/** Creates the starting positions the first time a company opens the screen. Existing ones are never touched. */
export async function seedDefaultPositions(orgId: string): Promise<void> {
  const { error } = await db
    .from('positions')
    .upsert(DEFAULT_POSITIONS.map((p) => ({ ...p, org_id: orgId })), { onConflict: 'org_id,key', ignoreDuplicates: true });
  fail(error);
}

export async function savePosition(orgId: string, id: string | null, draft: PositionDraft): Promise<Position> {
  const row = {
    name: draft.name,
    description: draft.description,
    default_pay_package_id: draft.default_pay_package_id,
    default_role: draft.default_role,
    default_permissions: draft.default_permissions,
    required_documents: draft.required_documents,
    onboarding_checklist: draft.onboarding_checklist,
    requires_onboarding: draft.requires_onboarding,
    sort_order: draft.sort_order,
    // Only sent when the editor knows about it, so saving still works before the newer column exists.
    ...(draft.default_employment_type !== undefined ? { default_employment_type: draft.default_employment_type } : {}),
  };
  if (id) {
    const { data, error } = await db.from('positions').update(row).eq('id', id).select('*').single();
    fail(error);
    return clean(data);
  }
  const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const key = `custom_${slug}_${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await db.from('positions').insert({ ...row, key, org_id: orgId, is_builtin: false }).select('*').single();
  fail(error);
  return clean(data);
}

export async function setPositionArchived(id: string, archived: boolean): Promise<Position> {
  const { data, error } = await db.rpc('set_position_archived', { _position_id: id, _archived: archived });
  fail(error);
  return clean(data);
}

export async function fetchPositionAssignments(filter: { driverId?: string; userId?: string }): Promise<PositionAssignment[]> {
  let q = db.from('position_assignments').select('*').order('effective_start', { ascending: false });
  if (filter.driverId) q = q.eq('driver_id', filter.driverId);
  if (filter.userId) q = q.eq('user_id', filter.userId);
  const { data, error } = await q;
  fail(error);
  return (data ?? []) as PositionAssignment[];
}

export async function assignPosition(args: { positionId: string; driverId: string | null; userId?: string | null; start: string; note?: string }) {
  const { data, error } = await db.rpc('assign_position', {
    _position_id: args.positionId,
    _driver_id: args.driverId,
    _user_id: args.userId ?? null,
    _start: args.start,
    _note: args.note ?? null,
  });
  fail(error);
  return data as PositionAssignment;
}

export interface AreaLimit {
  user_id: string;
  areas: string[];
  is_active: boolean;
  position_id: string | null;
}

export async function fetchAreaLimit(userId: string): Promise<AreaLimit | null> {
  const { data, error } = await db.from('user_area_access').select('user_id, areas, is_active, position_id').eq('user_id', userId).maybeSingle();
  fail(error);
  return data ? { ...data, areas: data.areas ?? [] } : null;
}

/** Limit a person to a list of areas, or lift the limit. Lifting keeps the record. */
export async function setAreaLimit(args: { userId: string; areas: string[]; active: boolean; positionId?: string | null }) {
  const { error } = await db.rpc('set_user_area_access', {
    _user_id: args.userId,
    _areas: args.areas,
    _active: args.active,
    _position_id: args.positionId ?? null,
  });
  fail(error);
}

/** Saved with an invitation, and applied automatically when the invitation is accepted. */
export async function createHirePlan(plan: {
  orgId: string;
  email: string;
  positionId: string | null;
  payPackageId: string | null;
  start: string;
  limitToAreas: boolean;
  areas: string[];
  /** W-2 or 1099, chosen by the office. Applied to the driver record when the person joins. */
  employmentType?: 'w2' | '1099' | 'lease_purchase' | null;
}) {
  const { error } = await db.from('hire_plans').insert({
    org_id: plan.orgId,
    email: plan.email.trim().toLowerCase(),
    position_id: plan.positionId,
    pay_package_id: plan.payPackageId,
    effective_start: plan.start,
    limit_to_areas: plan.limitToAreas,
    areas: plan.areas,
    employment_type: plan.employmentType ?? null,
  } as never);
  fail(error);
}

export async function setChecklistItem(assignmentId: string, itemId: string, done: boolean) {
  const { data, error } = await db.rpc('set_checklist_item', { _assignment_id: assignmentId, _item_id: itemId, _done: done });
  fail(error);
  return data as PositionAssignment;
}
