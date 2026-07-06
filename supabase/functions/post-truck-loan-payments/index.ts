// Posts monthly truck loan payments to public.expenses and public.truck_loan_payments.
// Idempotent per (truck_id, expense_type='Truck Loan', expense_date=<first-of-month>).
// Invoked monthly by pg_cron (with x-cron-secret header) or manually from the truck
// detail UI by an authenticated owner/payroll_admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const CRON_SECRET = Deno.env.get('POST_LOAN_CRON_SECRET') ?? '';

    // --- AuthN/AuthZ ------------------------------------------------------
    let callerOrgId: string | null = null;
    let isCron = false;

    const cronHeader = req.headers.get('x-cron-secret') ?? '';
    if (CRON_SECRET && cronHeader && cronHeader === CRON_SECRET) {
      isCron = true;
    } else {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        return json(401, { ok: false, error: 'Unauthorized' });
      }
      const token = authHeader.replace('Bearer ', '');
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return json(401, { ok: false, error: 'Unauthorized' });
      }
      const userId = userData.user.id;

      // Role + org check via SECURITY DEFINER helpers
      const adminForCheck = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false },
      });
      const [{ data: orgId }, { data: isOwner }, { data: isPayroll }] = await Promise.all([
        adminForCheck.rpc('get_user_org_id', { _user_id: userId }),
        adminForCheck.rpc('is_owner', { _user_id: userId }),
        adminForCheck.rpc('has_role', { _user_id: userId, _role: 'payroll_admin' }),
      ]);
      if (!orgId || (!isOwner && !isPayroll)) {
        return json(403, { ok: false, error: 'Forbidden' });
      }
      callerOrgId = orgId as string;
    }
    // ---------------------------------------------------------------------

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
    if (!isCron && callerOrgId) q = q.eq('org_id', callerOrgId);

    const { data: trucks, error: tErr } = await q;
    if (tErr) throw tErr;

    const results: Array<{ truck_id: string; unit_number: string; action: string }> = [];

    for (const t of (trucks ?? []) as Truck[]) {
      if (t.status === 'out_of_service') continue;
      if ((t.loan_balance ?? 0) <= 0 && t.loan_balance !== null) {
        results.push({ truck_id: t.id, unit_number: t.unit_number, action: 'skipped_paid_off' });
        continue;
      }

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

    return json(200, { ok: true, date: targetDate, results });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
