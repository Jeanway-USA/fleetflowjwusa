import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Same allowed origins as the other functions that read documents.
const ALLOWED_ORIGINS = [
  'https://tms.jeanwayusa.com',
  'https://fleetflowjwusa.lovable.app',
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    origin === allowed ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

interface WorkKindOption { key: string; label: string }
interface TruckOption { unit: string; make?: string | null; model?: string | null }

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const systemPrompt = `You read invoices and work orders for truck and trailer maintenance and repair: mobile roadside mechanics, dealer shops, Thermo King and Carrier reefer dealers, tire shops, parts counters. You return structured JSON and never guess.

RULES
1. vendor is the company that DID the work and issued the invoice. It is never the "Bill to", "Ship to", "Invoice to" or customer (for example Landstar), and never a "Customer PO".
2. Dates are YYYY-MM-DD. invoice_date is the invoice or order date. service_date is only a separate date the work was done, if one is printed; otherwise null.
3. truck_unit is the truck, tractor or unit number the work was done on, copied as printed, from labels like REF, Unit, Truck #, Tractor #, Vehicle, Equipment. If no truck or unit is on the document, return null. A "TRL#" or serial number on an accessory unit (an APU or reefer) that equals the truck number counts as the truck. Never guess.
4. odometer_miles is only a mileage or odometer reading in MILES. Engine hours, APU hours, reefer hours and total hours are NOT mileage: put those in engine_hours instead. If there is no mileage, null.
5. work_kinds: choose from the ALLOWED WORK KINDS list given with the request. Return the "key" of every kind that clearly applies. Use "repair" whenever something was fixed or replaced because it was broken or worn. A preventive maintenance service on a unit that also had a repair gets both. If nothing fits, return an empty list. Never return a key that is not in the list.
6. summary: one to three plain sentences, past tense, saying what was done and why (cause and correction when given). Example: "Replaced the air compressor discharge line and O-rings and topped off the coolant after an air leak." No prices, no part numbers.
7. line_items: every charge on the invoice. kind is "part" (anything bought, with a part number or a physical item), "labor" (hours, hourly rates, labor operation codes), "fee" (service call, trip or drive charge, environmental fee, shop supplies, freight, disposal), or "other". These tables are often jumbled in text: the description, quantity, rate and amount for one line may be separated. Match each description to ITS OWN quantity, rate and amount so that quantity x rate = amount (allow rounding). Labor rows use hours as the quantity. A description can wrap over several lines, and a labor operation can list sub-steps: keep those sub-steps in the description of that one line, not as separate lines. Do not add lines for subtotals, totals, tax or discounts.
8. Totals: subtotal is the amount before tax and discount. tax is sales tax. discount is a discount taken off, as a POSITIVE number. other_fees is any total charge listed separately from the line items (for example "Environmental charges $45.50" shown only in the totals block). total is the final amount due. Copy these as printed. Then check: the line item amounts should add up to the subtotal, and subtotal + tax + other_fees - discount should equal total. If a check fails, do NOT change numbers to force it: add a short warning that says what did not add up.
9. If something is not on the document or you cannot read it, use null (or [] for lists). Do not invent.
10. confidence is a number from 0 to 100 for each of: vendor, truck, date, work, totals.
Return ONLY a JSON object. No markdown, no code fences.`;

function buildUserPrompt(kinds: WorkKindOption[], trucks: TruckOption[]): string {
  const kindsText = kinds.length > 0 ? kinds.map((k) => `- ${k.key}: ${k.label}`).join('\n') : '- repair: Repair';
  const trucksText = trucks.length > 0 ? trucks.map((t) => `- ${t.unit}${[t.make, t.model].filter(Boolean).length ? ` (${[t.make, t.model].filter(Boolean).join(' ')})` : ''}`).join('\n') : '(none listed)';
  return `Read this invoice and return the JSON below.

ALLOWED WORK KINDS (use the key before the colon):
${kindsText}

OUR TRUCKS (for matching truck_unit; copy the number as printed on the invoice, do not force a match):
${trucksText}

JSON shape:
{
  "vendor": "company that did the work, or null",
  "invoice_number": "invoice or order number, or null",
  "invoice_date": "YYYY-MM-DD or null",
  "service_date": "YYYY-MM-DD or null",
  "truck_unit": "truck or unit number as printed, or null",
  "odometer_miles": number or null,
  "engine_hours": number or null,
  "work_kinds": ["keys from the allowed list"],
  "summary": "one to three plain sentences, or null",
  "line_items": [
    { "kind": "part" | "labor" | "fee" | "other", "description": "text", "part_number": "or null", "quantity": number, "unit_price": number, "amount": number }
  ],
  "subtotal": number or null,
  "tax": number or null,
  "discount": number or null,
  "other_fees": number or null,
  "total": number or null,
  "confidence": { "vendor": 0-100, "truck": 0-100, "date": 0-100, "work": 0-100, "totals": 0-100 },
  "warnings": ["short plain sentences"]
}`;
}

const MAX_BYTES = 12 * 1024 * 1024;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized - Authentication required' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase configuration missing');

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: 'Invalid authentication token' }, 401);
    const userId = claimsData.claims.sub;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Only people who can log shop work may use it.
    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['owner', 'maintenance'])
      .maybeSingle();
    if (roleError || !roleRow) return json({ error: 'Forbidden: insufficient permissions' }, 403);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { filePath, mimeType } = body ?? {};
    const kinds: WorkKindOption[] = Array.isArray(body?.workKinds) ? body.workKinds.slice(0, 60).filter((k: any) => typeof k?.key === 'string').map((k: any) => ({ key: String(k.key).slice(0, 40), label: String(k.label ?? k.key).slice(0, 80) })) : [];
    const trucks: TruckOption[] = Array.isArray(body?.trucks) ? body.trucks.slice(0, 200).filter((t: any) => typeof t?.unit === 'string').map((t: any) => ({ unit: String(t.unit).slice(0, 30), make: t.make ? String(t.make).slice(0, 40) : null, model: t.model ? String(t.model).slice(0, 40) : null })) : [];

    if (typeof filePath !== 'string' || !filePath) return json({ error: 'filePath is required' }, 400);
    const mime = typeof mimeType === 'string' && /^(application\/pdf|image\/(jpeg|png|webp))$/.test(mimeType) ? mimeType : null;
    if (!mime) return json({ error: 'Upload a PDF or a photo (JPG, PNG or WebP).' }, 400);

    // The file must be one this organization uploaded for reading.
    const { data: profile } = await supabaseAdmin.from('profiles').select('org_id').eq('user_id', userId).single();
    if (!profile?.org_id || !filePath.startsWith(`${profile.org_id}/temp-invoice/`) || filePath.includes('..')) {
      return json({ error: 'Forbidden: path does not belong to your organization' }, 403);
    }
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage.from('documents').download(filePath);
    if (downloadError || !fileData) throw new Error(`Failed to download PDF from storage: ${downloadError?.message || 'No data'}`);
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    // The temporary copy is not kept.
    supabaseAdmin.storage.from('documents').remove([filePath]).catch(() => {});
    if (bytes.byteLength === 0) return json({ error: 'The file is empty.' }, 400);
    if (bytes.byteLength > MAX_BYTES) return json({ error: 'File exceeds 12 MB limit.' }, 413);
    const base64 = uint8ArrayToBase64(bytes);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "text", text: buildUserPrompt(kinds, trucks) }, { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }] },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) return json({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
      if (response.status === 402) return json({ error: "AI credits exhausted. Please add credits to continue." }, 402);
      throw new Error('Document processing service is temporarily unavailable.');
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    let extracted: unknown;
    try {
      let clean = String(content).trim();
      if (clean.startsWith("```json")) clean = clean.slice(7);
      if (clean.startsWith("```")) clean = clean.slice(3);
      if (clean.endsWith("```")) clean = clean.slice(0, -3);
      extracted = JSON.parse(clean.trim());
    } catch (_parseError) {
      throw new Error("Failed to parse extracted data");
    }
    return json(extracted);
  } catch (error) {
    console.error("Parse service invoice error:", error);
    const safe = (error instanceof Error && (
      error.message === 'Failed to parse extracted data' ||
      error.message === 'Document processing service is temporarily unavailable.' ||
      error.message.startsWith('Failed to download PDF')
    )) ? error.message : 'An internal error occurred while reading the invoice.';
    return json({ error: safe }, 500);
  }
});
