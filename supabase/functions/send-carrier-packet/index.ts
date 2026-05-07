import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function buildCarrierPacketHtml(params: {
  orgName: string;
  message: string;
  documents: { label: string; url: string }[];
}): string {
  const { orgName, message, documents } = params;

  const docLinks = documents
    .map(
      (d) => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
          <a href="${d.url}" style="color: #2563eb; text-decoration: none; font-size: 14px; font-weight: 500;">${d.label}</a>
          <br/><span style="color: #6B7280; font-size: 12px;">Click to download</span>
        </td>
      </tr>`
    )
    .join('');

  const escapedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 640px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px;">
              <h2 style="margin: 0; color: #1a1a1a; font-size: 20px; font-weight: 700;">Carrier Packet from ${orgName}</h2>
            </td>
          </tr>
          <tr><td style="padding: 0 40px;"><hr style="border: none; border-top: 2px solid #F59E0B; margin: 0;" /></td></tr>

          <!-- Message -->
          <tr>
            <td style="padding: 24px 40px;">
              <p style="margin: 0; color: #333; font-size: 14px; line-height: 1.6;">${escapedMessage}</p>
            </td>
          </tr>

          <!-- Document Links -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <p style="margin: 0 0 12px; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Attached Documents</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fafafa; border-radius: 8px; border: 1px solid #e8e8e8;">
                ${docLinks}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #9a9a9a; font-size: 12px;">
                © ${new Date().getFullYear()} ${orgName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse request
    const { recipientEmail, message, documentIds } = await req.json();

    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return new Response(JSON.stringify({ error: 'recipientEmail is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one document must be selected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's org
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization: only owners or dispatchers may send carrier packets
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', profile.org_id)
      .in('role', ['owner', 'dispatcher'])
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, file_name, file_path, document_type')
      .in('id', documentIds)
      .eq('org_id', profile.org_id)
      .eq('related_type', 'carrier_packet');

    if (docError || !documents || documents.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid documents found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate signed URLs for each document (1 hour expiry)
    const docLinks: { label: string; url: string }[] = [];
    for (const doc of documents) {
      const { data: signedData, error: signError } = await supabaseAdmin
        .storage
        .from('documents')
        .createSignedUrl(doc.file_path, 3600);

      if (signError || !signedData?.signedUrl) {
        console.error(`Failed to sign ${doc.file_path}:`, signError);
        continue;
      }

      docLinks.push({
        label: `${doc.document_type} — ${doc.file_name}`,
        url: signedData.signedUrl,
      });
    }

    if (docLinks.length === 0) {
      return new Response(JSON.stringify({ error: 'Failed to generate download links' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get org name
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', profile.org_id)
      .single();

    const orgName = org?.name || 'Carrier';

    const emailHtml = buildCarrierPacketHtml({ orgName, message, documents: docLinks });

    // Send via Resend
    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: `${orgName} <no-reply@jeanwayusa.com>`,
      to: [recipientEmail],
      subject: `Carrier Packet — ${orgName}`,
      html: emailHtml,
    });

    console.log('Carrier packet email sent:', JSON.stringify(emailResponse));

    return new Response(JSON.stringify({ success: true, recipientEmail }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('send-carrier-packet error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
