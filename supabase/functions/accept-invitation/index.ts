import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
    if (!userEmail) return json({ error: 'Missing user email' }, 400);

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

    if (inviteErr) return json({ error: inviteErr.message }, 500);
    if (!invite) return json({ error: 'Invitation not found', reason: 'invalid' }, 404);

    if (invite.status === 'accepted') {
      return json({ error: 'Invitation already accepted', reason: 'already_accepted' }, 400);
    }
    if (invite.status !== 'pending') {
      return json({ error: `Invitation ${invite.status}`, reason: 'invalid' }, 400);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return json({ error: 'Invitation expired', reason: 'expired' }, 400);
    }
    if (invite.email.toLowerCase() !== userEmail) {
      return json({ error: 'Email mismatch', reason: 'email_mismatch', invite_email: invite.email }, 403);
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
    if (profileErr) return json({ error: `profile: ${profileErr.message}` }, 500);

    // 2. Replace user_roles with the invitation's role (single active org model).
    const { error: delRolesErr } = await admin.from('user_roles').delete().eq('user_id', userId);
    if (delRolesErr) return json({ error: `roles delete: ${delRolesErr.message}` }, 500);
    const { error: insRoleErr } = await admin
      .from('user_roles')
      .insert({ user_id: userId, role: invite.role });
    if (insRoleErr) return json({ error: `roles insert: ${insRoleErr.message}` }, 500);

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
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
