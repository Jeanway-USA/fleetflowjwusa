import { supabase } from '@/integrations/supabase/client';

export interface OutstandingTemplate {
  id: string;
  document_type: string;
  name: string | null;
  applies_to: 'shared' | 'w2' | '1099';
  builtin?: boolean;
}

export interface OutstandingResult {
  templates: OutstandingTemplate[];
  audience: 'w2' | '1099';
  orgId: string | null;
}

// Built-in onboarding forms that are hard-coded into the DriverOnboarding flow
// (not rows in document_templates). These must always be signed by the driver
// based on their employment type, so we synthesize them into the outstanding
// list when no matching row exists in driver_signed_documents.
const BUILTIN_W2: Array<{ document_type: string; name: string }> = [
  { document_type: 'w4', name: 'Federal W-4 Withholding' },
  { document_type: 'i9', name: 'Form I-9 — Employment Eligibility' },
  { document_type: 'state_tax', name: 'State Tax Withholding' },
  { document_type: 'direct_deposit_form', name: 'Direct Deposit Authorization' },
];

const BUILTIN_1099: Array<{ document_type: string; name: string }> = [
  { document_type: 'w9', name: 'Form W-9 — Taxpayer Identification' },
  { document_type: 'ioo_agreement', name: 'Independent Owner-Operator Agreement' },
];

/**
 * Returns active document templates and built-in onboarding forms the driver
 * has never signed (no row in driver_signed_documents at all). Templates in
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

  const filteredTemplates = (templatesData ?? []).filter((t) => {
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

  // Built-in forms based on employment type. Skip any the driver already signed
  // and any that are already covered by an active document_template with the
  // same document_type (to avoid duplicates).
  const templateTypes = new Set(filteredTemplates.map((t) => t.document_type));
  const builtinSource = audience === 'w2' ? BUILTIN_W2 : BUILTIN_1099;
  const builtins: OutstandingTemplate[] = builtinSource
    .filter((b) => !signedTypes.has(b.document_type) && !templateTypes.has(b.document_type))
    .map((b) => ({
      id: `builtin:${b.document_type}`,
      document_type: b.document_type,
      name: b.name,
      applies_to: audience,
      builtin: true,
    }));

  const outstanding = [
    ...filteredTemplates.filter((t) => !signedTypes.has(t.document_type)),
    ...builtins,
  ];

  return { templates: outstanding, audience, orgId: driver.org_id };
}
