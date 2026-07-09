import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface Body {
  instance_id?: string;
  from_step?: number;
  reassign_to?: string | null;
  reason?: string;
}

Deno.serve(async (req) => {
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
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const authed = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsRes, error: claimsErr } = await authed.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId = claimsRes.claims.sub as string;

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.instance_id || typeof body.from_step !== 'number' || body.from_step < 0) {
      return json({ error: 'instance_id and from_step required' }, 400);
    }
    const reason = (body.reason ?? '').trim();
    if (reason.length < 3) return json({ error: 'reason required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load instance
    const { data: inst, error: iErr } = await admin
      .from('document_instances')
      .select('id, org_id, status, current_step, signatory_roles, pdf_storage_path, title')
      .eq('id', body.instance_id)
      .maybeSingle();
    if (iErr || !inst) return json({ error: 'Instance not found' }, 404);
    if (inst.status === 'draft' || inst.status === 'voided') {
      return json({ error: `Cannot reopen a ${inst.status} document` }, 400);
    }

    // Authorize: caller must be owner/admin of the same org
    const { data: rolesRows, error: rErr } = await admin
      .from('user_roles')
      .select('role, org_id')
      .eq('user_id', userId)
      .eq('org_id', inst.org_id);
    if (rErr) return json({ error: rErr.message }, 500);
    const allowed = (rolesRows ?? []).some((r: any) => ['owner', 'admin'].includes(r.role));
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    const roles = (inst.signatory_roles ?? []) as string[];
    const fromStep = Math.min(body.from_step, Math.max(roles.length - 1, 0));

    // If reassign_to provided, ensure that user has the target role in the same org
    let reassignTo: string | null = null;
    if (body.reassign_to) {
      const targetRole = roles[fromStep];
      const { data: check, error: cErr } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('user_id', body.reassign_to)
        .eq('org_id', inst.org_id)
        .eq('role', targetRole)
        .maybeSingle();
      if (cErr) return json({ error: cErr.message }, 500);
      if (!check) return json({ error: 'Reassignee does not have the required role in this org' }, 400);
      reassignTo = body.reassign_to;
    }

    // Delete signatures at/after the fromStep
    const { error: delSigErr } = await admin
      .from('document_signatures')
      .delete()
      .eq('instance_id', inst.id)
      .gte('step_index', fromStep);
    if (delSigErr) return json({ error: delSigErr.message }, 500);

    // Remove the signed PDF if present
    if (inst.pdf_storage_path) {
      await admin.storage.from('signed-documents').remove([inst.pdf_storage_path]);
    }

    // Reset instance
    const { error: updErr } = await admin
      .from('document_instances')
      .update({
        status: 'pending_signatures',
        current_step: fromStep,
        completed_at: null,
        pdf_storage_path: null,
        assigned_to_user: reassignTo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inst.id);
    if (updErr) return json({ error: updErr.message }, 500);

    // Audit log
    await admin.from('audit_logs').insert({
      user_id: userId,
      org_id: inst.org_id,
      action: 'reopen',
      table_name: 'document_instances',
      resource_type: 'document_instance',
      record_id: inst.id,
      details: {
        from_step: fromStep,
        reassign_to: reassignTo,
        reason,
        title: inst.title,
      },
    } as any);

    return json({ ok: true, from_step: fromStep });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
