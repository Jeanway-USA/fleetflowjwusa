import { supabase } from '@/integrations/supabase/client';

export interface OutstandingTemplate {
  id: string;
  document_type: string;
  name: string | null;
  applies_to: 'shared' | 'w2' | '1099';
}

export interface OutstandingResult {
  templates: OutstandingTemplate[];
  audience: 'w2' | '1099';
  orgId: string | null;
}

/**
 * Returns active document templates the driver has never signed
 * (no row in driver_signed_documents at all). Templates in
 * `revision_requested` state are handled by the existing revision flow
 * and are excluded here so we don't double-count.
 */
export async function fetchOutstandingTemplates(
  driverId: string,
): Promise<OutstandingResult> {
  const { data: driver, error: dErr } = await supabase
    .from('drivers')
    .select('id, org_id, employment_type')
    .eq('id', driverId)
    .maybeSingle();
  if (dErr) throw dErr;
  if (!driver) return { templates: [], audience: '1099', orgId: null };

  const audience: 'w2' | '1099' =
    (driver as { employment_type?: string | null }).employment_type === 'w2_company'
      ? 'w2'
      : '1099';

  const { data: templatesData, error: tErr } = await supabase
    .from('document_templates')
    .select('id, document_type, name, applies_to')
    .eq('org_id', driver.org_id)
    .eq('is_active', true);
  if (tErr) throw tErr;

  const filtered = (templatesData ?? []).filter((t) => {
    const a = ((t as { applies_to?: string | null }).applies_to ?? 'shared') as
      | 'shared'
      | 'w2'
      | '1099';
    return a === 'shared' || a === audience;
  }) as OutstandingTemplate[];

  const { data: signed, error: sErr } = await supabase
    .from('driver_signed_documents')
    .select('document_type')
    .eq('driver_id', driverId);
  if (sErr) throw sErr;

  const signedTypes = new Set((signed ?? []).map((r) => r.document_type));
  const outstanding = filtered.filter((t) => !signedTypes.has(t.document_type));

  return { templates: outstanding, audience, orgId: driver.org_id };
}
