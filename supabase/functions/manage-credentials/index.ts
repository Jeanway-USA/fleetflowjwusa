import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ===== AES-GCM Encryption Helpers =====

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY');
  if (!keyString || keyString.length < 16) {
    throw new Error('Server encryption configuration error');
  }

  // Derive a 256-bit key from the secret using SHA-256
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(keyString));

  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV + ciphertext and base64 encode
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Convert to base64
  let binary = '';
  for (const byte of combined) {
    binary += String.fromCharCode(byte);
  }
  return 'enc:' + btoa(binary);
}

async function decrypt(encryptedData: string): Promise<string> {
  // If not encrypted (legacy plaintext), return as-is
  if (!encryptedData.startsWith('enc:')) {
    return encryptedData;
  }

  const key = await getEncryptionKey();
  const base64Data = encryptedData.slice(4); // Remove 'enc:' prefix

  // Decode base64
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Extract IV (first 12 bytes) and ciphertext
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// Export decrypt for reuse
export { decrypt };

// ===== Main Handler =====
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get driver_id for the authenticated user
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!driver) {
      return new Response(
        JSON.stringify({ error: 'Driver profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      // Save encrypted credentials
      const body = await req.json();
      const { landstar_username, landstar_password } = body;

      console.log(`Saving Landstar credentials for driver ${driver.id}`);

      // Encrypt the password if provided
      let encryptedPassword: string | null = null;
      if (landstar_password) {
        encryptedPassword = await encrypt(landstar_password);
        console.log('Password encrypted successfully');
      }

      // Check if settings exist
      const { data: existing } = await supabase
        .from('driver_settings')
        .select('id')
        .eq('driver_id', driver.id)
        .maybeSingle();

      const updateData = {
        landstar_username: landstar_username || null,
        landstar_password: encryptedPassword,
      };

      if (existing) {
        const { error } = await supabase
          .from('driver_settings')
          .update(updateData)
          .eq('driver_id', driver.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('driver_settings')
          .insert({
            driver_id: driver.id,
            ...updateData,
          });
        if (error) throw error;
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Credentials saved securely' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'GET') {
      // Return credential status (never return plaintext password)
      const { data: settings } = await supabase
        .from('driver_settings')
        .select('landstar_username, landstar_password')
        .eq('driver_id', driver.id)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          has_credentials: !!(settings?.landstar_username && settings?.landstar_password),
          landstar_username: settings?.landstar_username || '',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Credential management error:', error);
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
