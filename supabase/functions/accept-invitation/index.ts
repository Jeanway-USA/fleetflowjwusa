import { createClient } from 'npm:@supabase/supabase-js@2';

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
    origin === allowed || origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com')
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = (claimsData.claims.email as string | undefined)?.toLowerCase();
    if (!userEmail) return json({ error: 'Invalid session' }, 400);

    const body = await req.json().catch(() => ({}));
    const inviteToken = body?.token;
    if (!inviteToken || typeof inviteToken !== 'string') {
      return json({ error: 'Missing token', reason: 'invalid' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: invite, error: inviteErr } = await admin
      .from('invitations')
      .select('*')
      .eq('token', inviteToken)
      .maybeSingle();

    if (inviteErr) {
      console.error('invitation lookup failed:', inviteErr.message);
      return json({ error: 'Invitation acceptance failed. Please try again.' }, 500);
    }
    if (!invite) return json({ error: 'Invitation not found', reason: 'invalid' }, 404);

    if (invite.status === 'accepted') {
      return json({ error: 'Invitation already accepted', reason: 'already_accepted' }, 400);
    }
    if (invite.status !== 'pending') {
      return json({ error: 'Invitation is no longer valid', reason: 'invalid' }, 400);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return json({ error: 'Invitation expired', reason: 'expired' }, 400);
    }
    if (invite.email.toLowerCase() !== userEmail) {
      return json({ error: 'This invitation was sent to a different email address', reason: 'email_mismatch' }, 403);
    }

    // 1. Switch user's profile to the new org and reset onboarding state.
    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        org_id: invite.org_id,
        requires_onboarding: invite.requires_onboarding,
        onboarding_completed: false,
      })
      .eq('user_id', userId);
    if (profileErr) {
      console.error('profile update failed:', profileErr.message);
      return json({ error: 'Invitation acceptance failed. Please try again.' }, 500);
    }

    // 2. Replace user_roles with the invitation's role (single active org model).
    const { error: delRolesErr } = await admin.from('user_roles').delete().eq('user_id', userId);
    if (delRolesErr) {
      console.error('roles delete failed:', delRolesErr.message);
      return json({ error: 'Invitation acceptance failed. Please try again.' }, 500);
    }
    const { error: insRoleErr } = await admin
      .from('user_roles')
      .insert({ user_id: userId, role: invite.role });
    if (insRoleErr) {
      console.error('roles insert failed:', insRoleErr.message);
      return json({ error: 'Invitation acceptance failed. Please try again.' }, 500);
    }

    // 3. Link driver record if invitation targets one.
    if (invite.driver_id) {
      const { error: driverErr } = await admin
        .from('drivers')
        .update({ user_id: userId })
        .eq('id', invite.driver_id)
        .eq('org_id', invite.org_id);
      if (driverErr) console.error('driver link failed:', driverErr.message);
    }

    // 4. Mark invitation accepted.
    const { error: acceptErr } = await admin
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        invited_user_id: userId,
      })
      .eq('id', invite.id);
    if (acceptErr) console.error('invitation update failed:', acceptErr.message);

    // Fetch org name for nicer UX.
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', invite.org_id)
      .maybeSingle();

    return json({
      success: true,
      requires_onboarding: invite.requires_onboarding,
      org_id: invite.org_id,
      org_name: org?.name ?? null,
      role: invite.role,
    });
  } catch (e) {
    console.error('accept-invitation error:', e);
    return json({ error: 'Invitation acceptance failed. Please try again.' }, 500);
  }
});
