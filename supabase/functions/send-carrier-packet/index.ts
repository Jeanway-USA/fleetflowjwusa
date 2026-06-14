import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { buildFleetFlowEmail } from '../_shared/email-template.ts';

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

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '#';
    return escapeHtml(parsed.toString());
  } catch {
    return '#';
  }
}

function buildCarrierPacketBody(message: string, documents: { label: string; url: string }[]): string {
  const escapedMessage = escapeHtml(message).replace(/\n/g, '<br/>');

  const docLinks = documents
    .map(
      (d) => `
        <tr>
          <td style="padding: 12px 14px; border-bottom: 1px solid #e4e4e7;">
            <a href="${safeUrl(d.url)}" style="color: #2563eb; text-decoration: none; font-size: 14px; font-weight: 500;">${escapeHtml(d.label)}</a>
            <div style="color: #71717a; font-size: 12px; margin-top: 2px;">Click to download</div>
          </td>
        </tr>`
    )
    .join('');

  return `
    <p style="margin: 0 0 20px; color: #3f3f46; font-size: 16px; line-height: 1.6;">${escapedMessage}</p>

    <p style="margin: 0 0 10px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Attached Documents</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px;">
      ${docLinks}
    </table>
  `;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

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

    const { recipientEmail, message, documentIds } = await req.json();

    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return new Response(JSON.stringify({ error: 'recipientEmail is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (recipientEmail.length > 254 || !EMAIL_RE.test(recipientEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid recipientEmail format' }), {
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

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', profile.org_id)
      .single();

    const orgName = org?.name || 'Carrier';

    const emailHtml = buildFleetFlowEmail({
      previewText: `Carrier packet from ${orgName}`,
      headline: 'Carrier Onboarding Packet',
      bodyText: buildCarrierPacketBody(message, docLinks),
      footerContext: 'Download links expire in 1 hour for security.',
    });

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
