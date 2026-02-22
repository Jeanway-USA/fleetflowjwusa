import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ===== AES-GCM Encryption =====

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY');
  if (!keyString || keyString.length < 16) throw new Error('Server encryption configuration error');
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(keyString));
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let binary = '';
  for (const byte of combined) binary += String.fromCharCode(byte);
  return 'enc:' + btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const googleClientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
    const googleClientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

    if (!googleClientId || !googleClientSecret) {
      return new Response(JSON.stringify({ error: 'Google OAuth not configured on the platform' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's org and verify owner
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Only organization owners can manage storage' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orgId = profile.org_id;
    const body = await req.json();
    const { action } = body;

    // ===== GET AUTH URL =====
    if (action === 'get_auth_url') {
      const { redirect_uri } = body;
      if (!redirect_uri) {
        return new Response(JSON.stringify({ error: 'Missing redirect_uri' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const scope = 'https://www.googleapis.com/auth/drive.file';
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', googleClientId);
      authUrl.searchParams.set('redirect_uri', redirect_uri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== EXCHANGE AUTH CODE =====
    if (action === 'exchange_code') {
      const { code, redirect_uri } = body;

      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResp.ok) {
        const err = await tokenResp.text();
        console.error('Token exchange failed:', err);
        return new Response(JSON.stringify({ error: 'Failed to connect Google Drive. Please try again.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenData = await tokenResp.json();

      if (!tokenData.refresh_token) {
        return new Response(JSON.stringify({ error: 'No refresh token received. Please revoke access in your Google account settings and try again.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create root folder
      const accessToken = tokenData.access_token;
      const createFolderResp = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'FleetFlow Storage',
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });

      let rootFolderId = 'root';
      if (createFolderResp.ok) {
        const folderData = await createFolderResp.json();
        rootFolderId = folderData.id;
      }

      // Encrypt credentials (no client_id/secret needed — platform provides those)
      const credentials = {
        refresh_token: tokenData.refresh_token,
        access_token: tokenData.access_token,
        token_expiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
      };

      const encryptedCreds = await encrypt(JSON.stringify(credentials));

      const { error: upsertError } = await supabase
        .from('org_storage_config')
        .upsert({
          org_id: orgId,
          provider: 'google_drive',
          encrypted_credentials: encryptedCreds,
          root_folder_id: rootFolderId,
          connected_at: new Date().toISOString(),
          is_active: true,
        }, { onConflict: 'org_id' });

      if (upsertError) throw upsertError;

      return new Response(JSON.stringify({
        success: true,
        root_folder_id: rootFolderId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== DISCONNECT =====
    if (action === 'disconnect') {
      const { error } = await supabase
        .from('org_storage_config')
        .update({ is_active: false, provider: 'built_in' })
        .eq('org_id', orgId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== STATUS =====
    if (action === 'status') {
      const { data: config } = await supabase
        .from('org_storage_config')
        .select('provider, is_active, connected_at, root_folder_id')
        .eq('org_id', orgId)
        .maybeSingle();

      return new Response(JSON.stringify({
        provider: config?.provider || 'built_in',
        is_active: config?.is_active || false,
        connected_at: config?.connected_at || null,
        root_folder_id: config?.root_folder_id || null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Google Drive auth error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
