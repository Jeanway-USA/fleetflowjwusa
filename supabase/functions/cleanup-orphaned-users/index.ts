import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ORPHANED_USER_IDS = [
  '9bd408a2-6860-4efe-8a74-1f12b321a295', // zestyclan11@gmail.com
  'b24f465e-45bb-4f8e-8198-31beaa0a502a', // etwgaming123@gmail.com
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const userId of ORPHANED_USER_IDS) {
      await admin.from('user_roles').delete().eq('user_id', userId);
      await admin.from('profiles').delete().eq('user_id', userId);

      const { error } = await admin.auth.admin.deleteUser(userId);
      results.push({
        id: userId,
        success: !error,
        error: error?.message,
      });
      console.log(`Delete user ${userId}:`, error ? error.message : 'success');
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
