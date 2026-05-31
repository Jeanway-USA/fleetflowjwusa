import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS - restrict to known domains
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an owner
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);

    if (authError || !claimsData?.claims?.sub) {
      console.log('Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const requestingUser = { id: claimsData.claims.sub as string };

    // Check if requesting user is a super_admin (bypass org check)
    const { data: superAdminRow } = await supabaseAdmin
      .from('super_admins')
      .select('user_id')
      .eq('user_id', requestingUser.id)
      .maybeSingle();
    const isSuperAdmin = !!superAdminRow;

    // Check if requesting user is an owner
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!roleData && !isSuperAdmin) {
      console.log('User is not an owner:', requestingUser.id);
      return new Response(JSON.stringify({ error: 'Only owners can delete users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get request body
    const { userId } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-deletion
    if (userId === requestingUser.id) {
      return new Response(JSON.stringify({ error: 'You cannot delete your own account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isSuperAdmin) {
      // Verify org membership: same org, OR target is an orphan (no org_id yet)
      const { data: ownerProfile } = await supabaseAdmin
        .from('profiles')
        .select('org_id')
        .eq('user_id', requestingUser.id)
        .single();

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle();

      const targetOrg = targetProfile?.org_id ?? null;
      const sameOrg = !!ownerProfile?.org_id && targetOrg === ownerProfile.org_id;
      const targetIsOrphan = targetOrg === null;

      if (!sameOrg && !targetIsOrphan) {
        console.log('Cross-org deletion attempt blocked:', requestingUser.id, '->', userId);
        return new Response(JSON.stringify({ error: 'Cannot delete users outside your organization' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('Attempting to delete user:', userId);

    // Purge / null-out all references to this user before deleting the auth row.
    // Each step is logged but non-fatal so one failure doesn't abort the rest.
    const purgeSteps: Array<[string, () => Promise<{ error: unknown }>]> = [
      ['crm_activities', () => supabaseAdmin.from('crm_activities').delete().eq('user_id', userId)],
      ['maintenance_request_messages', () => supabaseAdmin.from('maintenance_request_messages').delete().eq('sender_user_id', userId)],
      ['user_feedback', () => supabaseAdmin.from('user_feedback').delete().eq('user_id', userId)],
      ['documents.uploaded_by', () => supabaseAdmin.from('documents').update({ uploaded_by: null }).eq('uploaded_by', userId)],
      ['document_templates.created_by', () => supabaseAdmin.from('document_templates').update({ created_by: null }).eq('created_by', userId)],
      ['changelog.created_by', () => supabaseAdmin.from('changelog').update({ created_by: null }).eq('created_by', userId)],
      ['drivers.user_id', () => supabaseAdmin.from('drivers').update({ user_id: null }).eq('user_id', userId)],
      ['super_admin_audit_logs', () => supabaseAdmin.from('super_admin_audit_logs').delete().eq('user_id', userId)],
      ['super_admins', () => supabaseAdmin.from('super_admins').delete().eq('user_id', userId)],
      ['user_roles', () => supabaseAdmin.from('user_roles').delete().eq('user_id', userId)],
      ['profiles', () => supabaseAdmin.from('profiles').delete().eq('user_id', userId)],
    ];

    for (const [label, fn] of purgeSteps) {
      try {
        const { error } = await fn();
        if (error) console.log(`Purge warning [${label}]:`, (error as { message?: string }).message);
      } catch (e) {
        console.log(`Purge exception [${label}]:`, (e as Error).message);
      }
    }

    // Record the deletion in audit_logs (attributed to the requesting owner)
    try {
      await supabaseAdmin.from('audit_logs').insert({
        user_id: requestingUser.id,
        action: 'user_deleted',
        table_name: 'auth.users',
        record_id: userId,
        details: { deleted_by: requestingUser.id, deleted_user_id: userId },
      });
    } catch (e) {
      console.log('Audit log insert failed:', (e as Error).message);
    }

    // Delete the user from auth.users
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting user from auth:', deleteError.message);
      throw deleteError;
    }

    console.log('User deleted successfully:', userId);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'User deleted successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error deleting user:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred while deleting the user.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
