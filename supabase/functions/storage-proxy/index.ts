import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ===== AES-GCM Encryption Helpers (shared with manage-credentials) =====

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY');
  if (!keyString || keyString.length < 16) {
    throw new Error('Server encryption configuration error');
  }
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(keyString));
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function decrypt(encryptedData: string): Promise<string> {
  if (!encryptedData.startsWith('enc:')) return encryptedData;
  const key = await getEncryptionKey();
  const base64Data = encryptedData.slice(4);
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
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

// ===== Google Drive Helpers =====

interface DriveCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token?: string;
  token_expiry?: number;
}

async function getAccessToken(creds: DriveCredentials, supabase: any, orgId: string): Promise<string> {
  // If we have a valid access token, use it
  if (creds.access_token && creds.token_expiry && Date.now() < creds.token_expiry - 60000) {
    return creds.access_token;
  }

  // Use platform-level OAuth credentials (not stored per-org)
  const clientId = creds.client_id || Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
  const clientSecret = creds.client_secret || Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

  // Refresh the access token
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('Token refresh failed:', err);
    throw new Error('Failed to refresh Google Drive access token');
  }

  const data = await resp.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;

  // Update stored credentials with new access token
  creds.access_token = newAccessToken;
  creds.token_expiry = Date.now() + expiresIn * 1000;

  const encryptedCreds = await encrypt(JSON.stringify(creds));
  await supabase
    .from('org_storage_config')
    .update({ encrypted_credentials: encryptedCreds })
    .eq('org_id', orgId);

  return newAccessToken;
}

async function ensureFolderExists(accessToken: string, parentFolderId: string, folderName: string): Promise<string> {
  // Check if folder exists
  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (searchResp.ok) {
    const searchData = await searchResp.json();
    if (searchData.files?.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create folder
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    console.error(`Failed to create folder '${folderName}':`, errText);
    throw new Error(`Failed to create folder: ${folderName}`);
  }

  const folderData = await createResp.json();
  return folderData.id;
}

async function uploadToDrive(accessToken: string, folderId: string, fileName: string, fileData: Uint8Array, contentType: string): Promise<string> {
  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  // Use multipart upload
  const boundary = 'storage_proxy_boundary';
  const metadataStr = JSON.stringify(metadata);

  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    fileData,
    encoder.encode(`\r\n--${boundary}--`),
  ];

  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }

  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Drive upload error:', errText);
    throw new Error('Failed to upload file to Google Drive');
  }

  const result = await resp.json();
  return result.id;
}

async function downloadFromDrive(accessToken: string, fileId: string): Promise<{ data: Uint8Array; contentType: string; fileName: string }> {
  // Get file metadata first
  const metaResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!metaResp.ok) throw new Error('File not found in Google Drive');
  const meta = await metaResp.json();

  // Download file content
  const downloadResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!downloadResp.ok) throw new Error('Failed to download file from Google Drive');

  const data = new Uint8Array(await downloadResp.arrayBuffer());
  return { data, contentType: meta.mimeType || 'application/octet-stream', fileName: meta.name };
}

async function deleteFromDrive(accessToken: string, fileId: string): Promise<void> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok && resp.status !== 404) {
    throw new Error('Failed to delete file from Google Drive');
  }
}

// ===== Main Handler =====

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

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

    // Get user's org
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

    const orgId = profile.org_id;

    // Check org storage config
    const { data: storageConfig } = await supabase
      .from('org_storage_config')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    const url = new URL(req.url);
    const action = url.searchParams.get('action'); // upload, download, delete

    // ===== UPLOAD =====
    if (req.method === 'POST' && action === 'upload') {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const bucket = formData.get('bucket') as string || 'documents';
      const filePath = formData.get('path') as string;

      if (!file || !filePath) {
        return new Response(JSON.stringify({ error: 'Missing file or path' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const fileData = new Uint8Array(await file.arrayBuffer());

      // Google Drive path
      if (storageConfig?.provider === 'google_drive' && storageConfig.encrypted_credentials) {
        const creds: DriveCredentials = JSON.parse(await decrypt(storageConfig.encrypted_credentials));
        const accessToken = await getAccessToken(creds, supabase, orgId);

        // Create bucket subfolder if needed
        const rootFolderId = storageConfig.root_folder_id || 'root';
        const bucketFolderId = await ensureFolderExists(accessToken, rootFolderId, bucket);

        // Create path subfolders
        const pathParts = filePath.split('/');
        const fileName = pathParts.pop()!;
        let currentFolderId = bucketFolderId;
        for (const part of pathParts) {
          currentFolderId = await ensureFolderExists(accessToken, currentFolderId, part);
        }

        const driveFileId = await uploadToDrive(accessToken, currentFolderId, fileName, fileData, file.type || 'application/octet-stream');

        return new Response(JSON.stringify({
          path: `gdrive:${driveFileId}`,
          provider: 'google_drive',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Fallback: built-in storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileData, { contentType: file.type || 'application/octet-stream' });

      if (uploadError) throw uploadError;

      return new Response(JSON.stringify({
        path: filePath,
        provider: 'built_in',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== DOWNLOAD =====
    if (req.method === 'GET' && action === 'download') {
      const fileRef = url.searchParams.get('fileRef');
      const bucket = url.searchParams.get('bucket') || 'documents';

      if (!fileRef) {
        return new Response(JSON.stringify({ error: 'Missing fileRef' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Google Drive file
      if (fileRef.startsWith('gdrive:')) {
        if (!storageConfig?.encrypted_credentials) {
          return new Response(JSON.stringify({ error: 'Google Drive not configured' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const driveFileId = fileRef.slice(7);
        const creds: DriveCredentials = JSON.parse(await decrypt(storageConfig.encrypted_credentials));
        const accessToken = await getAccessToken(creds, supabase, orgId);
        const { data, contentType, fileName } = await downloadFromDrive(accessToken, driveFileId);

        return new Response(data, {
          headers: {
            ...corsHeaders,
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${fileName}"`,
          },
        });
      }

      // Built-in storage: generate signed URL
      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(fileRef, 3600);

      if (signedError || !signedData?.signedUrl) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ url: signedData.signedUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== GET SIGNED URL =====
    if (req.method === 'GET' && action === 'signed-url') {
      const fileRef = url.searchParams.get('fileRef');
      const bucket = url.searchParams.get('bucket') || 'documents';

      if (!fileRef) {
        return new Response(JSON.stringify({ error: 'Missing fileRef' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Google Drive: proxy URL through this function
      if (fileRef.startsWith('gdrive:')) {
        const proxyUrl = `${supabaseUrl}/functions/v1/storage-proxy?action=download&fileRef=${encodeURIComponent(fileRef)}`;
        return new Response(JSON.stringify({ url: proxyUrl, needsAuth: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Built-in: return signed URL
      // Handle old public URL format
      let storagePath = fileRef;
      if (fileRef.startsWith('http')) {
        const publicPattern = `/storage/v1/object/public/${bucket}/`;
        const idx = fileRef.indexOf(publicPattern);
        if (idx !== -1) {
          storagePath = fileRef.slice(idx + publicPattern.length);
        }
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600);

      if (signedError || !signedData?.signedUrl) {
        return new Response(JSON.stringify({ error: 'File not found', url: null }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ url: signedData.signedUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== DELETE =====
    if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
      const body = await req.json();
      const { fileRef, bucket = 'documents' } = body;

      if (!fileRef) {
        return new Response(JSON.stringify({ error: 'Missing fileRef' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Google Drive
      if (fileRef.startsWith('gdrive:')) {
        if (!storageConfig?.encrypted_credentials) {
          return new Response(JSON.stringify({ error: 'Google Drive not configured' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const driveFileId = fileRef.slice(7);
        const creds: DriveCredentials = JSON.parse(await decrypt(storageConfig.encrypted_credentials));
        const accessToken = await getAccessToken(creds, supabase, orgId);
        await deleteFromDrive(accessToken, driveFileId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Built-in storage
      await supabase.storage.from(bucket).remove([fileRef]);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== STATUS =====
    if (req.method === 'GET' && action === 'status') {
      return new Response(JSON.stringify({
        provider: storageConfig?.provider || 'built_in',
        is_active: storageConfig?.is_active || false,
        connected_at: storageConfig?.connected_at || null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Storage proxy error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
