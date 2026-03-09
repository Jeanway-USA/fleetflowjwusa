import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the requesting user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data, error: claimsError } = await supabaseAdmin.auth.getUser(token);

    if (claimsError || !data?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = data.user.id;
    console.log('Self-deleting account for user:', userId);

    // Nullify references in load_status_logs
    const { error: logError } = await supabaseAdmin
      .from('load_status_logs')
      .update({ changed_by: null })
      .eq('changed_by', userId);
    if (logError) console.log('Error clearing load_status_logs:', logError.message);

    // Nullify driver user_id references
    const { error: driverError } = await supabaseAdmin
      .from('drivers')
      .update({ user_id: null })
      .eq('user_id', userId);
    if (driverError) console.log('Error clearing drivers:', driverError.message);

    // Nullify document uploaded_by references
    const { error: docError } = await supabaseAdmin
      .from('documents')
      .update({ uploaded_by: null })
      .eq('uploaded_by', userId);
    if (docError) console.log('Error clearing documents:', docError.message);

    // Delete user roles
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    if (roleError) console.log('Error deleting roles:', roleError.message);

    // Delete profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId);
    if (profileError) console.log('Error deleting profile:', profileError.message);

    // Delete from auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Error deleting auth user:', deleteError.message);
      throw deleteError;
    }

    console.log('Account self-deleted successfully:', userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in delete-own-account:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
