// Posts due truck loan installments to public.truck_loan_payments.
// Delegates to public.post_due_truck_loan_payments(); idempotent per truck and month.
// pg_cron calls the SQL function directly (daily); this endpoint remains for external
// callers (x-cron-secret) and authenticated owners/payroll admins.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
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

    // Posting logic lives in public.post_due_truck_loan_payments() (also run daily
    // by pg_cron), so every path posts on the loan's due day and never twice.
    let body: { truck_id?: string } = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { /* empty body ok */ }
    }

    const client = isCron
      ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
      : createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
          auth: { persistSession: false },
        });

    const { data, error } = await client.rpc('post_due_truck_loan_payments', {
      p_truck_id: body.truck_id ?? null,
    });
    if (error) throw error;

    return json(200, { ok: true, posted: data ?? [], org_id: callerOrgId });
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
