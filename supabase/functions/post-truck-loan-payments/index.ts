// Posts monthly truck loan payments to public.expenses and public.truck_loan_payments.
// Idempotent per (truck_id, expense_type='Truck Loan', expense_date=<first-of-month>).
// Invoked monthly by pg_cron, or manually from the truck detail UI for backfill.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type Truck = {
  id: string;
  org_id: string;
  unit_number: string;
  status: string;
  lender_name: string | null;
  monthly_payment: number | null;
  loan_start_date: string | null;
  loan_term_months: number | null;
  loan_balance: number | null;
};

const firstOfMonth = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    let body: { truck_id?: string; expense_date?: string } = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { /* empty body ok */ }
    }

    const targetDate = body.expense_date ?? firstOfMonth(new Date());

    let q = admin
      .from('trucks')
      .select('id, org_id, unit_number, status, lender_name, monthly_payment, loan_start_date, loan_term_months, loan_balance')
      .not('monthly_payment', 'is', null)
      .gt('monthly_payment', 0);
    if (body.truck_id) q = q.eq('id', body.truck_id);

    const { data: trucks, error: tErr } = await q;
    if (tErr) throw tErr;

    const results: Array<{ truck_id: string; unit_number: string; action: string }> = [];

    for (const t of (trucks ?? []) as Truck[]) {
      if (t.status === 'out_of_service') continue;
      if ((t.loan_balance ?? 0) <= 0 && t.loan_balance !== null) {
        results.push({ truck_id: t.id, unit_number: t.unit_number, action: 'skipped_paid_off' });
        continue;
      }

      // Idempotency check
      const { data: existing } = await admin
        .from('expenses')
        .select('id')
        .eq('truck_id', t.id)
        .eq('expense_type', 'Truck Loan')
        .eq('expense_date', targetDate)
        .maybeSingle();
      if (existing) {
        results.push({ truck_id: t.id, unit_number: t.unit_number, action: 'already_posted' });
        continue;
      }

      const amount = Number(t.monthly_payment);

      const { error: eErr } = await admin.from('expenses').insert({
        org_id: t.org_id,
        truck_id: t.id,
        expense_type: 'Truck Loan',
        amount,
        expense_date: targetDate,
        vendor: t.lender_name ?? 'Lender',
        description: `Auto: monthly loan payment for Unit ${t.unit_number}`,
        is_approved: false,
      });
      if (eErr) throw eErr;

      const { error: lErr } = await admin.from('truck_loan_payments').insert({
        org_id: t.org_id,
        truck_id: t.id,
        payment_date: targetDate,
        amount,
        note: 'Auto-posted monthly payment',
      });
      if (lErr) throw lErr;

      results.push({ truck_id: t.id, unit_number: t.unit_number, action: 'posted' });
    }

    return new Response(JSON.stringify({ ok: true, date: targetDate, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
