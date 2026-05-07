import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

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

function safeUrl(u: string | null | undefined): string {
  if (!u) return '';
  const trimmed = String(u).trim();
  if (/^https?:\/\//i.test(trimmed)) return escapeHtml(trimmed);
  return '';
}

function buildInvoiceEmailHtml(params: {
  orgName: string;
  logoUrl: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  loadDisplayId: string;
  origin: string;
  destination: string;
  deliveryDate: string;
  brokerName: string | null;
  lineItems: { label: string; amount: number }[];
  total: number;
}): string {
  const { orgName, logoUrl, invoiceNumber, invoiceDate, loadDisplayId, origin, destination, deliveryDate, brokerName, lineItems, total } = params;

  const safeOrgName = escapeHtml(orgName);
  const safeLogoUrl = safeUrl(logoUrl);
  const logoSection = safeLogoUrl
    ? `<img src="${safeLogoUrl}" alt="${safeOrgName}" style="max-height: 48px; max-width: 160px; margin-bottom: 8px;" />`
    : '';

  const lineItemRows = lineItems
    .filter(item => item.amount > 0)
    .map(item => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; color: #333; font-size: 14px;">${escapeHtml(item.label)}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; color: #333; font-size: 14px; text-align: right; font-weight: 500;">${formatCurrency(item.amount)}</td>
      </tr>
    `).join('');

  const billToSection = brokerName
    ? `<p style="margin: 0 0 4px; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Bill To</p>
       <p style="margin: 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">${escapeHtml(brokerName)}</p>`
    : '';

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
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: top;">
                    ${logoSection}
                    <h2 style="margin: 0; color: #1a1a1a; font-size: 20px; font-weight: 700;">${safeOrgName}</h2>
                  </td>
                  <td style="text-align: right; vertical-align: top;">
                    <p style="margin: 0; color: #1a1a1a; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">INVOICE</p>
                    <p style="margin: 4px 0 0; color: #6B7280; font-size: 13px; font-family: monospace;">${escapeHtml(invoiceNumber)}</p>
                    <p style="margin: 2px 0 0; color: #6B7280; font-size: 13px;">${escapeHtml(invoiceDate)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding: 0 40px;"><hr style="border: none; border-top: 2px solid #F59E0B; margin: 0;" /></td></tr>

          <!-- Bill To + Load Details -->
          <tr>
            <td style="padding: 24px 40px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: top; width: 50%;">
                    ${billToSection}
                  </td>
                  <td style="vertical-align: top; width: 50%; text-align: right;">
                    <p style="margin: 0 0 4px; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Load Reference</p>
                    <p style="margin: 0 0 12px; color: #1a1a1a; font-size: 15px; font-weight: 600;">${escapeHtml(loadDisplayId)}</p>
                    <p style="margin: 0 0 4px; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Delivery Date</p>
                    <p style="margin: 0; color: #1a1a1a; font-size: 14px;">${escapeHtml(deliveryDate)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Route -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fafafa; border-radius: 8px; border: 1px solid #e8e8e8;">
                <tr>
                  <td style="padding: 14px 16px; border-bottom: 1px solid #e8e8e8;">
                    <span style="color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Origin</span><br/>
                    <span style="color: #1a1a1a; font-size: 14px; font-weight: 500;">${escapeHtml(origin)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 16px;">
                    <span style="color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Destination</span><br/>
                    <span style="color: #1a1a1a; font-size: 14px; font-weight: 500;">${escapeHtml(destination)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line Items -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr style="background: #f9fafb;">
                  <th style="padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Description</th>
                  <th style="padding: 12px 16px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Amount</th>
                </tr>
                ${lineItemRows}
                <tr>
                  <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a; border-top: 2px solid #1a1a1a;">Total</td>
                  <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a; text-align: right; border-top: 2px solid #1a1a1a;">${formatCurrency(total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #9a9a9a; font-size: 12px;">
                © ${new Date().getFullYear()} ${safeOrgName}. All rights reserved.
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
    const logoUrl = org?.logo_url || null;

    // Find broker/agent email from CRM contacts
    // Fallback chain: override_email → load.invoice_email → CRM lookup
    let recipientEmail: string | null = override_email || load.invoice_email || null;
    let brokerName: string | null = null;

    if (!recipientEmail && load.agency_code) {
      // Try crm_contacts first
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
        // Fallback to company_resources
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

    // Build line items — fetch itemized accessorials
    const { data: loadAccessorials } = await supabaseAdmin
      .from('load_accessorials')
      .select('accessorial_type, amount, percentage')
      .eq('load_id', load_id);

    const lineItems: { label: string; amount: number }[] = [
      { label: 'Linehaul Rate', amount: load.rate || 0 },
      { label: 'Fuel Surcharge', amount: load.fuel_surcharge || 0 },
    ];

    if (loadAccessorials && loadAccessorials.length > 0) {
      // Use itemized accessorials
      for (const acc of loadAccessorials) {
        const net = (acc.amount || 0) * ((acc.percentage || 100) / 100);
        if (net > 0) {
          lineItems.push({ label: acc.accessorial_type, amount: net });
        }
      }
    } else {
      // Fallback to legacy flat fields
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

    const emailHtml = buildInvoiceEmailHtml({
      orgName,
      logoUrl,
      invoiceNumber,
      invoiceDate,
      loadDisplayId,
      origin: load.origin,
      destination: load.destination,
      deliveryDate,
      brokerName,
      lineItems,
      total,
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

    // Persist the recipient email used for this invoice
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
