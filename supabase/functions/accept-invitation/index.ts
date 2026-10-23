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

    // The invitation was sent to an email address. Only someone who has confirmed they own it may accept: without
    // this, anyone could create an account with the invitee's address and take the role meant for them.
    const { data: authUser, error: authUserErr } = await admin.auth.admin.getUserById(userId);
    if (authUserErr || !authUser?.user?.email_confirmed_at) {
      return json({ error: 'Confirm your email address first, then open the invitation again.', reason: 'email_unconfirmed' }, 403);
    }

    // Accepting replaces every role this account holds (one active company per account). That must never quietly
    // strip someone who owns a different company, so stop and say so instead.
    const { data: ownedElsewhere } = await admin
      .from('user_roles')
      .select('org_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .neq('org_id', invite.org_id)
      .limit(1);
    if (ownedElsewhere && ownedElsewhere.length > 0) {
      return json({
        error: 'This account owns another company, so it cannot join a second one. Use a different email address for this invitation.',
        reason: 'owns_other_org',
      }, 409);
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
      .insert({ user_id: userId, role: invite.role, org_id: invite.org_id });
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

    // 3b. Make sure the person has a record to onboard against. Drivers get a drivers row (found by email or
    // created); everyone else gets a staff record. The hire plan (applied when the invitation is marked
    // accepted below) needs this record to exist first.
    const { data: nameRow } = await admin.from('profiles').select('first_name, last_name').eq('user_id', userId).maybeSingle();
    if (invite.role === 'driver' && !invite.driver_id) {
      const { data: existingDriver } = await admin
        .from('drivers')
        .select('id, user_id')
        .eq('org_id', invite.org_id)
        .ilike('email', invite.email)
        .maybeSingle();
      if (existingDriver) {
        if (!existingDriver.user_id) {
          await admin.from('drivers').update({ user_id: userId }).eq('id', existingDriver.id);
        }
      } else {
        const { error: drvInsErr } = await admin.from('drivers').insert({
          org_id: invite.org_id,
          user_id: userId,
          first_name: nameRow?.first_name || invite.email.split('@')[0],
          last_name: nameRow?.last_name || '',
          email: invite.email,
          status: 'active',
          pay_type: 'percentage',
          pay_rate: 0,
        });
        if (drvInsErr) console.error('driver create failed:', drvInsErr.message);
      }
    } else if (invite.role !== 'driver') {
      const { error: empErr } = await admin.rpc('ensure_employee', {
        _org: invite.org_id, _user: userId, _email: invite.email, _first: nameRow?.first_name ?? null, _last: nameRow?.last_name ?? null,
      });
      if (empErr) console.error('staff record failed:', empErr.message);
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
