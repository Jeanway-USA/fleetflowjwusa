import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

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

const STATUS_COLORS: Record<string, string> = {
  pending: '#6B7280',
  assigned: '#3B82F6',
  at_pickup: '#F59E0B',
  loading: '#F59E0B',
  in_transit: '#8B5CF6',
  at_delivery: '#10B981',
  unloading: '#10B981',
  delivered: '#059669',
  cancelled: '#EF4444',
};

function buildEmailHtml(params: {
  loadDisplayId: string;
  statusLabel: string;
  statusColor: string;
  origin: string;
  destination: string;
  trackingUrl: string | null;
  driverLocationText: string;
  agentName: string | null;
}): string {
  const { loadDisplayId, statusLabel, statusColor, origin, destination, trackingUrl, driverLocationText, agentName } = params;

  const trackingSection = trackingUrl
    ? `
      <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 24px;">
        <tr>
          <td align="center">
            <a href="${trackingUrl}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);">
              Track This Load Live →
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const locationSection = driverLocationText
    ? `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
          <span style="color: #6B7280; font-size: 13px;">📍 Driver Location</span>
          <span style="float: right; color: #1a1a1a; font-size: 13px; font-weight: 500;">${driverLocationText}</span>
        </td>
      </tr>`
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
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">Fleet Flow TMS</h1>
              <p style="margin: 6px 0 0; color: rgba(255, 255, 255, 0.85); font-size: 13px;">Load Status Update</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 40px;">

              ${agentName ? `<p style="margin: 0 0 20px; color: #4a4a4a; font-size: 15px;">Hi <strong>${agentName}</strong>,</p>` : ''}

              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 15px; line-height: 1.6;">
                There's a status update for one of your loads:
              </p>

              <!-- Status Highlight -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fafafa; border-radius: 10px; border: 1px solid #e8e8e8; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="margin: 0 0 4px; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Load Reference</p>
                    <p style="margin: 0 0 16px; color: #1a1a1a; font-size: 22px; font-weight: 700; font-family: monospace;">#${loadDisplayId}</p>

                    <p style="margin: 0 0 4px; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Current Status</p>
                    <span style="display: inline-block; padding: 6px 16px; background-color: ${statusColor}20; color: ${statusColor}; border: 1px solid ${statusColor}40; border-radius: 20px; font-size: 14px; font-weight: 600;">
                      ${statusLabel}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Route Details -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                    <span style="color: #6B7280; font-size: 13px;">🔵 Pickup</span>
                    <span style="float: right; color: #1a1a1a; font-size: 13px; font-weight: 500; max-width: 300px; text-align: right;">${origin}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                    <span style="color: #6B7280; font-size: 13px;">🔴 Delivery</span>
                    <span style="float: right; color: #1a1a1a; font-size: 13px; font-weight: 500; max-width: 300px; text-align: right;">${destination}</span>
                  </td>
                </tr>
                ${locationSection}
              </table>

              ${trackingSection}

              <p style="margin: 28px 0 0; color: #9a9a9a; font-size: 12px; line-height: 1.6;">
                This is an automated notification from Fleet Flow TMS. To stop receiving these emails for this load, ask your dispatcher to disable Auto Email Updates in the load settings.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #9a9a9a; font-size: 12px;">
                © ${new Date().getFullYear()} Fleet Flow TMS by JeanWayUSA. All rights reserved.
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

    // Validate webhook secret from the DB trigger (stored in internal_config table)
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

    // Read the expected secret from internal_config (RLS-protected, only service role can read)
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

    // supabaseAdmin already created above during webhook secret validation

    const resend = new Resend(resendApiKey);

    // Parse the Supabase Database Webhook payload
    const payload = await req.json();
    console.log('Webhook payload received:', JSON.stringify(payload));

    // DB Webhook format: { type, table, schema, record, old_record }
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

    // Fetch load details
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

    // Respect the auto_email_updates flag
    if (load.auto_email_updates === false) {
      console.log('Auto email updates disabled for load:', loadId);
      return new Response(JSON.stringify({ skipped: true, reason: 'auto_email_updates disabled' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip if no agency_code to look up the agent
    if (!load.agency_code) {
      console.log('No agency_code on load, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'no agency_code' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Look up agent email from company_resources
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
      // 2) Fallback: crm_contacts
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

    // Fetch driver location (optional enrichment)
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

    // Build tracking URL
    const appUrl = 'https://fleetflowjwusa.lovable.app';
    const trackingUrl = load.tracking_id
      ? `${appUrl}/track?tracking_id=${load.tracking_id}`
      : null;

    const loadDisplayId = load.landstar_load_id || load.id.slice(0, 8).toUpperCase();
    const statusLabel = STATUS_LABELS[newStatus] || newStatus;
    const statusColor = STATUS_COLORS[newStatus] || '#6B7280';

    const emailHtml = buildEmailHtml({
      loadDisplayId,
      statusLabel,
      statusColor,
      origin: load.origin,
      destination: load.destination,
      trackingUrl,
      driverLocationText,
      agentName,
    });

    // Send via Resend
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
