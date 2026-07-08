// Central token hydration for document templates and instances.
// Replaces {{token}} placeholders with actual runtime values.

export interface HydrationContext {
  driver?: {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    license_number?: string | null;
    license_state?: string | null;
    license_expiry?: string | null;
    medical_card_expiry?: string | null;
    endorsements?: string[] | null;
    has_twic?: boolean | null;
    twic_expiry?: string | null;
    pay_type?: string | null;
    pay_rate?: number | null;
  } | null;
  signer?: {
    name?: string | null;
    role?: string | null;
    email?: string | null;
  } | null;
  company?: {
    name?: string | null;
    address?: string | null;
  } | null;
  instance?: {
    id?: string;
    title?: string;
    metadata?: Record<string, string | number | boolean | null | undefined> | null;
  } | null;
}

function extractStateFromAddress(address: string | null | undefined): string {
  if (!address) return '';
  // Look for a two-letter uppercase code preceded by a comma/space, before optional ZIP.
  const m = address.match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  return m ? m[1] : '';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString();
  } catch {
    return String(iso);
  }
}

function fmtPayType(pt: string | null | undefined): string {
  if (!pt) return '';
  const map: Record<string, string> = {
    per_mile: 'Per mile (CPM)',
    cpm: 'Per mile (CPM)',
    percentage: 'Percentage of gross',
    flat: 'Flat weekly',
    hourly: 'Hourly',
    salary: 'Salary',
  };
  return map[pt.toLowerCase()] ?? pt;
}

function fmtPayRate(rate: number | null | undefined, type: string | null | undefined): string {
  if (rate == null) return '';
  const t = (type ?? '').toLowerCase();
  if (t === 'per_mile' || t === 'cpm') return `$${Number(rate).toFixed(3)}/mi`;
  if (t === 'percentage') return `${Number(rate)}%`;
  if (t === 'hourly') return `$${Number(rate).toFixed(2)}/hr`;
  return `$${Number(rate).toLocaleString()}`;
}

export function buildTokenMap(ctx: HydrationContext): Record<string, string> {
  const d = ctx.driver ?? {};
  const s = ctx.signer ?? {};
  const c = ctx.company ?? {};
  const meta = ctx.instance?.metadata ?? {};

  const driverName = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
  const contractorState = extractStateFromAddress(d.address) || (d.license_state ?? '');

  const map: Record<string, string> = {
    today_date: new Date().toLocaleDateString(),
    current_date: new Date().toLocaleDateString(),
    company_name: c.name ?? '',
    company_address: c.address ?? '4700 Diplomacy Rd, Fort Worth, TX 76155',
    driver_name: driverName,
    driver_address: d.address ?? '',
    contractor_state: contractorState,
    email: d.email ?? '',
    phone_number: d.phone ?? '',
    license_number: d.license_number ?? '',
    cdl_number: d.license_number ?? '',
    license_expiry: fmtDate(d.license_expiry),
    dot_medical_expiry: fmtDate(d.medical_card_expiry),
    endorsements_list: d.endorsements && d.endorsements.length > 0 ? d.endorsements.join(', ') : 'None',
    twic_status:
      d.has_twic === true
        ? `Yes${d.twic_expiry ? ` — expires ${fmtDate(d.twic_expiry)}` : ''}`
        : d.has_twic === false
          ? 'No'
          : '',
    pay_type: fmtPayType(d.pay_type),
    pay_rate: fmtPayRate(d.pay_rate, d.pay_type),
    signer_name: s.name ?? '',
    signer_role: s.role ?? '',
    signer_email: s.email ?? '',
  };

  // Overlay any metadata provided on the instance (values filled in during signing).
  for (const [key, value] of Object.entries(meta)) {
    if (value != null && value !== '') {
      map[key] = String(value);
    }
  }

  return map;
}

/**
 * Replace {{token}} occurrences in the source with values from the map.
 * Unknown tokens are left in place so admins can spot missing data.
 */
export function hydrateTokens(source: string, ctx: HydrationContext): string {
  if (!source) return '';
  const map = buildTokenMap(ctx);
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, token: string) => {
    return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : full;
  });
}

/**
 * List tokens present in the source that are NOT already provided by the context.
 * Useful for driving the "fields to fill" panel in the signing workspace.
 */
export function extractUnresolvedTokens(source: string, ctx: HydrationContext): string[] {
  if (!source) return [];
  const map = buildTokenMap(ctx);
  const seen = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const t = m[1];
    if (!Object.prototype.hasOwnProperty.call(map, t) || !map[t]) seen.add(t);
  }
  // Signature tokens are handled by the signature pad, not by inputs.
  seen.delete('driver_signature');
  seen.delete('owner_signature');
  seen.delete('signer_signature');
  seen.delete('page_break');
  seen.delete('file_upload');
  return Array.from(seen);
}
