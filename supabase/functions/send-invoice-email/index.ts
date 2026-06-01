import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { buildFleetFlowEmail } from '../_shared/email-template.ts';

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInvoiceBodyHtml(params: {
  invoiceNumber: string;
  invoiceDate: string;
  loadDisplayId: string;
  origin: string;
  destination: string;
  deliveryDate: string;
  brokerName: string | null;
  lineItems: { label: string; amount: number }[];
  total: number;
  orgName: string;
}): string {
  const { invoiceNumber, invoiceDate, loadDisplayId, origin, destination, deliveryDate, brokerName, lineItems, total, orgName } = params;

  const lineItemRows = lineItems
    .filter(item => item.amount > 0)
    .map(item => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e4e4e7; color: #3f3f46; font-size: 14px;">${escapeHtml(item.label)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e4e4e7; color: #18181b; font-size: 14px; text-align: right; font-weight: 500;">${formatCurrency(item.amount)}</td>
      </tr>
    `).join('');

  const billTo = brokerName
    ? `<p style="margin: 0 0 4px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Bill To</p>
       <p style="margin: 0; color: #18181b; font-size: 15px; font-weight: 600;">${escapeHtml(brokerName)}</p>`
    : '';

  return `
    <p style="margin: 0 0 20px; color: #3f3f46; font-size: 16px; line-height: 1.6;">
      A new invoice has been issued by <strong>${escapeHtml(orgName)}</strong>. The full breakdown is below.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
      <tr>
        <td style="vertical-align: top; width: 50%;">
          ${billTo}
        </td>
        <td style="vertical-align: top; width: 50%; text-align: right;">
          <p style="margin: 0 0 4px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Invoice</p>
          <p style="margin: 0 0 8px; color: #18181b; font-size: 14px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(invoiceNumber)}</p>
          <p style="margin: 0; color: #71717a; font-size: 13px;">${escapeHtml(invoiceDate)}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 0 0 20px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px;">
      <tr>
        <td style="padding: 14px 16px; border-bottom: 1px solid #e4e4e7;">
          <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Load Reference</div>
          <div style="color: #18181b; font-size: 14px; font-weight: 600; margin-top: 2px;">${escapeHtml(loadDisplayId)}</div>
        </td>
        <td style="padding: 14px 16px; border-bottom: 1px solid #e4e4e7; text-align: right;">
          <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Delivery Date</div>
          <div style="color: #18181b; font-size: 14px; margin-top: 2px;">${escapeHtml(deliveryDate)}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 14px 16px; border-bottom: 1px solid #e4e4e7;">
          <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Origin</div>
          <div style="color: #18181b; font-size: 14px; margin-top: 2px;">${escapeHtml(origin)}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 14px 16px;">
          <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Destination</div>
          <div style="color: #18181b; font-size: 14px; margin-top: 2px;">${escapeHtml(destination)}</div>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 0 0 8px;">
      <tr style="background: #f4f4f5;">
        <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; font-weight: 600; border-bottom: 1px solid #e4e4e7;">Description</th>
        <th style="padding: 10px 12px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; font-weight: 600; border-bottom: 1px solid #e4e4e7;">Amount</th>
      </tr>
      ${lineItemRows}
      <tr>
        <td style="padding: 14px 12px; font-size: 15px; font-weight: 700; color: #18181b; border-top: 2px solid #18181b;">Total</td>
        <td style="padding: 14px 12px; font-size: 15px; font-weight: 700; color: #18181b; text-align: right; border-top: 2px solid #18181b;">${formatCurrency(total)}</td>
      </tr>
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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse request
    const { load_id, override_email } = await req.json();
    if (!load_id) {
      return new Response(JSON.stringify({ error: 'load_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's org_id
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('org_id')
      .eq('user_id', userId)
      .single();

    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization: only owners, dispatchers, or payroll admins may send invoices
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('org_id', profile.org_id)
      .in('role', ['owner', 'dispatcher', 'payroll_admin'])
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch load (with org_id check for IDOR protection)
    const { data: load, error: loadError } = await supabaseAdmin
      .from('fleet_loads')
      .select('*')
      .eq('id', load_id)
      .eq('org_id', profile.org_id)
      .single();

    if (loadError || !load) {
      return new Response(JSON.stringify({ error: 'Load not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch org branding
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, logo_url')
      .eq('id', profile.org_id)
      .single();

    const orgName = org?.name || 'Company';

    // Find broker/agent email from CRM contacts
    let recipientEmail: string | null = override_email || load.invoice_email || null;
    let brokerName: string | null = null;

    if (!recipientEmail && load.agency_code) {
      const { data: contact } = await supabaseAdmin
        .from('crm_contacts')
        .select('email, company_name, contact_name')
        .eq('agent_code', load.agency_code)
        .eq('org_id', profile.org_id)
        .maybeSingle();

      if (contact?.email) {
        recipientEmail = contact.email;
        brokerName = contact.contact_name || contact.company_name;
      } else {
        const { data: resource } = await supabaseAdmin
          .from('company_resources')
          .select('email, name')
          .eq('agent_code', load.agency_code)
          .eq('org_id', profile.org_id)
          .maybeSingle();

        if (resource?.email) {
          recipientEmail = resource.email;
          brokerName = resource.name;
        }
      }
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No recipient email found. Link a broker/agent with a matching agency code in your CRM, or provide an email manually.',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build line items
    const { data: loadAccessorials } = await supabaseAdmin
      .from('load_accessorials')
      .select('accessorial_type, amount, percentage')
      .eq('load_id', load_id);

    const lineItems: { label: string; amount: number }[] = [
      { label: 'Linehaul Rate', amount: load.rate || 0 },
      { label: 'Fuel Surcharge', amount: load.fuel_surcharge || 0 },
    ];

    if (loadAccessorials && loadAccessorials.length > 0) {
      for (const acc of loadAccessorials) {
        const net = (acc.amount || 0) * ((acc.percentage || 100) / 100);
        if (net > 0) {
          lineItems.push({ label: acc.accessorial_type, amount: net });
        }
      }
    } else {
      if (load.accessorials) lineItems.push({ label: 'Accessorials', amount: load.accessorials });
      if (load.detention_pay) lineItems.push({ label: 'Detention', amount: load.detention_pay });
      if (load.lumper) lineItems.push({ label: 'Lumper', amount: load.lumper });
    }

    const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

    const invoiceNumber = load.invoice_number || `INV-${load.id.slice(0, 6).toUpperCase()}`;
    const loadDisplayId = load.landstar_load_id || load.id.slice(0, 8).toUpperCase();

    const now = new Date();
    const invoiceDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let deliveryDate = '—';
    if (load.delivery_date) {
      deliveryDate = new Date(load.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const bodyHtml = buildInvoiceBodyHtml({
      invoiceNumber,
      invoiceDate,
      loadDisplayId,
      origin: load.origin,
      destination: load.destination,
      deliveryDate,
      brokerName,
      lineItems,
      total,
      orgName,
    });

    const trackingUrl = load.tracking_id
      ? `https://fleetflowjwusa.lovable.app/track?tracking_id=${load.tracking_id}`
      : undefined;

    const emailHtml = buildFleetFlowEmail({
      previewText: `Invoice ${invoiceNumber} for load ${loadDisplayId}`,
      headline: `New Invoice from ${orgName}`,
      bodyText: bodyHtml,
      buttonText: trackingUrl ? 'View Load Details' : undefined,
      buttonUrl: trackingUrl,
      footerContext: `You're receiving this invoice because your agency code is linked to this load in ${orgName}'s TMS.`,
    });

    // Send via Resend
    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: `${orgName} <no-reply@jeanwayusa.com>`,
      to: [recipientEmail],
      subject: `Invoice ${invoiceNumber} — ${loadDisplayId} | ${orgName}`,
      html: emailHtml,
    });

    console.log('Invoice email sent:', JSON.stringify(emailResponse));

    await supabaseAdmin
      .from('fleet_loads')
      .update({ invoice_email: recipientEmail })
      .eq('id', load_id);

    return new Response(JSON.stringify({
      success: true,
      recipientEmail,
      brokerName,
      invoiceNumber,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('send-invoice-email error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
