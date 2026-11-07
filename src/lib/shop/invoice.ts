import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compress-image';

/**
 * Reading a vendor's invoice for work already done. The document is read by the parse-service-invoice function; what comes
 * back is never trusted as it is. Every field is cleaned, dates and kinds of work are checked, and the line items are added
 * up against the totals so a misread number is flagged instead of saved.
 */

export type LineKind = 'part' | 'labor' | 'fee' | 'other';

export interface InvoiceLine {
  kind: LineKind;
  description: string;
  partNumber: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface MathCheck {
  /** The line items added up. */
  itemsTotal: number;
  /** True when some way of adding the invoice up reaches the total, false when none does, null when there is no total to check. */
  ok: boolean | null;
}

export interface ParsedInvoice {
  vendor: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  serviceDate: string | null;
  /** The date to log: the service date, else the invoice date. Never in the future. */
  workDate: string | null;
  truckUnit: string | null;
  odometer: number | null;
  engineHours: number | null;
  workKinds: string[];
  summary: string | null;
  lines: InvoiceLine[];
  subtotal: number | null;
  tax: number;
  discount: number;
  otherFees: number;
  total: number | null;
  /** What the job cost: the printed total, else the lines plus tax less the discount. */
  cost: number;
  byKind: Record<LineKind, number>;
  math: MathCheck;
  warnings: string[];
  confidence: Record<string, number>;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const TOLERANCE = 0.02;

/** "$1,234.50", "1,234.5", 1234.5 and "(12.00)" all read as numbers; anything else is null. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || !/[0-9]/.test(s)) return null;
  return negative ? -n : n;
}

const text = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** A real calendar date in YYYY-MM-DD, or null. */
export function toIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const LINE_KINDS: LineKind[] = ['part', 'labor', 'fee', 'other'];

/** Cleans what the reader returned. Keeps only work kinds we offer, real dates and real numbers. */
export function normalizeInvoice(raw: unknown, ctx: { allowedKinds: string[]; today: string }): ParsedInvoice {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const warnings: string[] = Array.isArray(r.warnings) ? r.warnings.map((w) => text(w, 200)).filter(Boolean) as string[] : [];

  const lines: InvoiceLine[] = (Array.isArray(r.line_items) ? r.line_items : [])
    .map((x: any): InvoiceLine | null => {
      const description = text(x?.description, 300);
      const amount = toNumber(x?.amount);
      if (!description || amount == null) return null;
      const quantity = toNumber(x?.quantity);
      const q = quantity != null && quantity > 0 ? quantity : 1;
      const price = toNumber(x?.unit_price);
      const kind: LineKind = LINE_KINDS.includes(x?.kind) ? x.kind : 'other';
      return { kind, description, partNumber: text(x?.part_number, 60), quantity: q, unitPrice: round2(price != null && price >= 0 ? price : amount / q), amount: round2(amount) };
    })
    .filter((l): l is InvoiceLine => l !== null);

  const subtotal = toNumber(r.subtotal);
  const tax = Math.max(0, toNumber(r.tax) ?? 0);
  const discount = Math.abs(toNumber(r.discount) ?? 0);
  const otherFees = Math.max(0, toNumber(r.other_fees) ?? 0);
  const totalRaw = toNumber(r.total);
  const total = totalRaw != null && totalRaw >= 0 ? round2(totalRaw) : null;

  const itemsTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const byKind: Record<LineKind, number> = { part: 0, labor: 0, fee: 0, other: 0 };
  for (const l of lines) byKind[l.kind] = round2(byKind[l.kind] + l.amount);

  // The ways an invoice can legitimately add up: the lines or the printed subtotal as a base (the subtotal on some invoices
  // already includes tax), with or without a separately listed fee, plus tax, less any discount.
  const bases = [itemsTotal, subtotal].filter((b): b is number => b != null);
  const candidates = bases.flatMap((b) => [b + tax - discount, b + otherFees + tax - discount, b - discount]);
  const totalAddsUp = total == null ? null : candidates.some((c) => Math.abs(c - total) <= TOLERANCE);
  // The lines themselves must agree with the printed subtotal (which on some invoices already includes tax or a listed fee).
  // Otherwise a single misread line would be hidden by a subtotal that is right.
  const itemsMatchSubtotal = subtotal == null || lines.length === 0 || [subtotal, subtotal - tax, subtotal - otherFees, subtotal - tax - otherFees].some((s) => Math.abs(itemsTotal - s) <= TOLERANCE);
  const ok = total == null ? null : totalAddsUp === true && itemsMatchSubtotal;
  if (total != null && lines.length > 0 && ok === false) {
    warnings.push(
      totalAddsUp && subtotal != null
        ? `The items add up to $${itemsTotal.toFixed(2)}, but the invoice subtotal is $${subtotal.toFixed(2)}. A line may have been misread. Check the amounts before saving.`
        : `The items add up to $${itemsTotal.toFixed(2)}, but the invoice total is $${total.toFixed(2)}. Check the amounts before saving.`,
    );
  }
  if (total == null && lines.length > 0) warnings.push('No invoice total was found. The cost was added up from the items.');

  const cost = total ?? round2(itemsTotal + tax - discount);

  const invoiceDate = toIsoDate(r.invoice_date);
  const serviceDate = toIsoDate(r.service_date);
  let workDate = serviceDate ?? invoiceDate;
  if (workDate && workDate > ctx.today) {
    warnings.push(`The invoice date (${workDate}) is in the future, so the date was left blank.`);
    workDate = null;
  }

  const allowed = new Set(ctx.allowedKinds);
  const workKinds = Array.from(new Set((Array.isArray(r.work_kinds) ? r.work_kinds : []).filter((k): k is string => typeof k === 'string' && allowed.has(k))));

  const odometer = toNumber(r.odometer_miles);
  const hours = toNumber(r.engine_hours);
  const confidence: Record<string, number> = {};
  if (r.confidence && typeof r.confidence === 'object') {
    for (const [k, v] of Object.entries(r.confidence as Record<string, unknown>)) {
      const n = toNumber(v);
      if (n != null) confidence[k] = Math.max(0, Math.min(100, Math.round(n)));
    }
  }

  return {
    vendor: text(r.vendor, 120),
    invoiceNumber: text(r.invoice_number, 60),
    invoiceDate, serviceDate, workDate,
    truckUnit: text(r.truck_unit, 40),
    odometer: odometer != null && odometer > 0 && odometer < 5_000_000 ? Math.round(odometer) : null,
    engineHours: hours != null && hours > 0 ? hours : null,
    workKinds,
    summary: text(r.summary, 600),
    lines,
    subtotal: subtotal != null ? round2(subtotal) : null,
    tax: round2(tax), discount: round2(discount), otherFees: round2(otherFees), total,
    cost, byKind,
    math: { itemsTotal, ok },
    warnings,
    confidence,
  };
}

/** The truck an invoice is about, when its number matches exactly one of ours. */
export function matchTruck(unit: string | null | undefined, trucks: Array<{ id: string; unit_number: string }>): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const u = norm(unit ?? '');
  if (u.length < 2) return null;
  const exact = trucks.filter((t) => norm(t.unit_number) === u);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  const loose = trucks.filter((t) => { const n = norm(t.unit_number); return n.length >= 3 && (u.includes(n) || n.includes(u)); });
  return loose.length === 1 ? loose[0].id : null;
}

export interface LoggedPart { name: string; number: string | null; quantity: number; unitCost: number }

/** The parts on the invoice, ready to save with the job. */
export function partsFrom(p: Pick<ParsedInvoice, 'lines'>): LoggedPart[] {
  return p.lines.filter((l) => l.kind === 'part' && l.amount > 0).map((l) => ({
    name: l.description.slice(0, 200), number: l.partNumber, quantity: l.quantity, unitCost: round2(l.unitPrice || l.amount / l.quantity),
  }));
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What to write in the job's notes: where the cost came from, so the number can be checked later. */
export function invoiceNotes(p: Pick<ParsedInvoice, 'vendor' | 'invoiceNumber' | 'invoiceDate' | 'byKind' | 'tax' | 'discount' | 'otherFees' | 'total' | 'cost' | 'engineHours'>): string {
  const head = ['Invoice', p.invoiceNumber ? `#${p.invoiceNumber}` : null, p.vendor ? `from ${p.vendor}` : null, p.invoiceDate ? `dated ${p.invoiceDate}` : null].filter(Boolean).join(' ');
  const parts: string[] = [];
  if (p.byKind.part) parts.push(`Parts ${money(p.byKind.part)}`);
  if (p.byKind.labor) parts.push(`Labor ${money(p.byKind.labor)}`);
  if (p.byKind.fee) parts.push(`Fees ${money(p.byKind.fee)}`);
  if (p.byKind.other) parts.push(`Other ${money(p.byKind.other)}`);
  if (p.otherFees && !p.byKind.fee) parts.push(`Fees ${money(p.otherFees)}`);
  if (p.tax) parts.push(`Tax ${money(p.tax)}`);
  if (p.discount) parts.push(`Discount -${money(p.discount)}`);
  const lines = [head, parts.length ? `${parts.join(' · ')} · Total ${money(p.cost)}` : null, p.engineHours ? `Unit hours at service: ${p.engineHours}` : null];
  return lines.filter(Boolean).join('\n');
}

/** A short description of the job when the reader gave no summary: the biggest items on the invoice. */
export function fallbackSummary(p: Pick<ParsedInvoice, 'lines'>): string | null {
  const top = [...p.lines].filter((l) => l.kind === 'part' || l.kind === 'labor').sort((a, b) => b.amount - a.amount).slice(0, 3).map((l) => l.description);
  return top.length ? `Per invoice: ${top.join(', ')}.` : null;
}

const MAX_BYTES = 12 * 1024 * 1024;

export function invoiceFileProblem(file: { size: number; type: string; name: string }): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (!isPdf && !isImage) return 'Upload a PDF or a photo (JPG, PNG or WebP) of the invoice.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_BYTES) return 'That file is over 12 MB. Use a smaller scan or photo.';
  return null;
}

/** Sends the invoice to be read and returns it cleaned. Throws a plain sentence when it cannot be read. */
export async function parseServiceInvoice(file: File, args: { orgId: string; workKinds: Array<{ key: string; label: string }>; trucks: Array<{ unit_number: string; make?: string | null; model?: string | null }>; today: string }): Promise<ParsedInvoice> {
  const problem = invoiceFileProblem(file);
  if (problem) throw new Error(problem);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const upload = isPdf ? file : await compressImage(file);
  const mimeType = isPdf ? 'application/pdf' : upload.type || file.type;
  const path = `${args.orgId}/temp-invoice/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: uploadError } = await supabase.storage.from('documents').upload(path, upload, { contentType: mimeType });
  if (uploadError) throw new Error('The invoice could not be uploaded for reading. Try again.');

  const { data, error } = await supabase.functions.invoke('parse-service-invoice', {
    body: { filePath: path, mimeType, workKinds: args.workKinds, trucks: args.trucks.map((t) => ({ unit: t.unit_number, make: t.make ?? null, model: t.model ?? null })) },
  });
  if (error) throw new Error(/not found|404|Failed to send a request|Edge Function|Failed to fetch|NetworkError/i.test(error.message ?? '') ? 'Reading invoices is not switched on yet.' : (error.message || 'The invoice could not be read.'));
  if ((data as any)?.error) throw new Error((data as any).error);
  return normalizeInvoice(data, { allowedKinds: args.workKinds.map((k) => k.key), today: args.today });
}
