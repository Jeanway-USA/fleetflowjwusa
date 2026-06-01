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

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  at_pickup: 'At Pickup',
  loading: 'Loading',
  in_transit: 'In Transit',
  at_delivery: 'At Delivery',
  unloading: 'Unloading',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStatusBody(params: {
  agentName: string | null;
  loadDisplayId: string;
  statusLabel: string;
  origin: string;
  destination: string;
  driverLocationText: string;
}): string {
  const { agentName, loadDisplayId, statusLabel, origin, destination, driverLocationText } = params;

  const greeting = agentName
    ? `<p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.6;">Hi <strong>${escapeHtml(agentName)}</strong>,</p>`
    : '';

  const locationRow = driverLocationText
    ? `<tr>
         <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 13px;">Driver Location</td>
         <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #18181b; font-size: 13px; text-align: right; font-weight: 500;">${escapeHtml(driverLocationText)}</td>
       </tr>`
    : '';

  return `
    ${greeting}
    <p style="margin: 0 0 20px; color: #3f3f46; font-size: 16px; line-height: 1.6;">
      There's a status update for one of your loads.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; margin: 0 0 8px;">
      <tr>
        <td style="padding: 12px 14px; color: #71717a; font-size: 13px;">Load Reference</td>
        <td style="padding: 12px 14px; color: #18181b; font-size: 14px; text-align: right; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">#${escapeHtml(loadDisplayId)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 13px;">Current Status</td>
        <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #2563eb; font-size: 14px; text-align: right; font-weight: 600;">${escapeHtml(statusLabel)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 13px;">Pickup</td>
        <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #18181b; font-size: 13px; text-align: right; font-weight: 500;">${escapeHtml(origin)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 13px;">Delivery</td>
        <td style="padding: 10px 14px; border-top: 1px solid #e4e4e7; color: #18181b; font-size: 13px; text-align: right; font-weight: 500;">${escapeHtml(destination)}</td>
      </tr>
      ${locationRow}
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

    const webhookSecret = req.headers.get('x-webhook-secret');
    if (!webhookSecret) {
      console.warn('Missing x-webhook-secret header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: configRow, error: configError } = await supabaseAdmin
      .from('internal_config')
      .select('value')
      .eq('key', 'email_webhook_secret')
      .single();

    if (configError || !configRow || webhookSecret !== configRow.value) {
      console.warn('Invalid webhook secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);

    const payload = await req.json();
    console.log('Webhook payload received:', JSON.stringify(payload));

    const record = payload.record ?? payload;
    const loadId: string | null = record.load_id ?? null;
    const newStatus: string | null = record.new_status ?? null;

    if (!loadId || !newStatus) {
      console.log('Missing load_id or new_status, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'missing fields' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: load, error: loadError } = await supabaseAdmin
      .from('fleet_loads')
      .select('id, landstar_load_id, tracking_id, origin, destination, driver_id, org_id, agency_code, auto_email_updates')
      .eq('id', loadId)
      .single();

    if (loadError || !load) {
      console.error('Load not found:', loadError?.message);
      return new Response(JSON.stringify({ skipped: true, reason: 'load not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (load.auto_email_updates === false) {
      console.log('Auto email updates disabled for load:', loadId);
      return new Response(JSON.stringify({ skipped: true, reason: 'auto_email_updates disabled' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!load.agency_code) {
      console.log('No agency_code on load, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'no agency_code' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let agentEmail: string | null = null;
    let agentName: string | null = null;

    const { data: resource } = await supabaseAdmin
      .from('company_resources')
      .select('email, name')
      .eq('agent_code', load.agency_code)
      .eq('org_id', load.org_id)
      .maybeSingle();

    if (resource?.email) {
      agentEmail = resource.email;
      agentName = resource.name;
    } else {
      const { data: contact } = await supabaseAdmin
        .from('crm_contacts')
        .select('email, company_name, contact_name')
        .eq('agent_code', load.agency_code)
        .eq('org_id', load.org_id)
        .maybeSingle();

      if (contact?.email) {
        agentEmail = contact.email;
        agentName = contact.contact_name || contact.company_name;
      }
    }

    if (!agentEmail) {
      console.log('No agent email found for agency_code:', load.agency_code);
      return new Response(JSON.stringify({ skipped: true, reason: 'no agent email found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let driverLocationText = '';
    if (load.driver_id) {
      const { data: location } = await supabaseAdmin
        .from('driver_locations')
        .select('latitude, longitude, is_sharing')
        .eq('driver_id', load.driver_id)
        .maybeSingle();

      if (location?.is_sharing && location.latitude && location.longitude) {
        driverLocationText = `${Math.abs(location.latitude).toFixed(4)}°${location.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(location.longitude).toFixed(4)}°${location.longitude >= 0 ? 'E' : 'W'}`;
      }
    }

    // Lookup org name for the footer
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', load.org_id)
      .single();
    const orgName = org?.name || 'your dispatcher';

    const appUrl = 'https://fleetflowjwusa.lovable.app';
    const trackingUrl = load.tracking_id
      ? `${appUrl}/track?tracking_id=${load.tracking_id}`
      : undefined;

    const loadDisplayId = load.landstar_load_id || load.id.slice(0, 8).toUpperCase();
    const statusLabel = STATUS_LABELS[newStatus] || newStatus;

    const bodyHtml = buildStatusBody({
      agentName,
      loadDisplayId,
      statusLabel,
      origin: load.origin,
      destination: load.destination,
      driverLocationText,
    });

    const emailHtml = buildFleetFlowEmail({
      previewText: `Status update: ${statusLabel}`,
      headline: `Load #${loadDisplayId} — ${statusLabel}`,
      bodyText: bodyHtml,
      buttonText: trackingUrl ? 'Track This Load Live' : undefined,
      buttonUrl: trackingUrl,
      footerContext: `Automated update from ${orgName} via FleetFlow TMS. To stop receiving these for this load, ask your dispatcher to disable Auto Email Updates.`,
    });

    const emailResponse = await resend.emails.send({
      from: 'Fleet Flow TMS <no-reply@jeanwayusa.com>',
      to: [agentEmail],
      subject: `Load #${loadDisplayId}: Status Update — ${statusLabel}`,
      html: emailHtml,
    });

    // @ts-ignore
    console.log('Email sent:', emailResponse?.data?.id ?? emailResponse);

    return new Response(JSON.stringify({ success: true, recipient: agentEmail, load_id: loadId, status: newStatus }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('email-load-status error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
