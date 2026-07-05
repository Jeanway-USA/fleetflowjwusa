import { Resend } from 'https://esm.sh/resend@4.0.0';
import { buildFleetFlowEmail } from '../_shared/email-template.ts';

const ALLOWED_ORIGINS = [
  'https://tms.jeanwayusa.com',
  'https://fleetflowjwusa.lovable.app',
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed =
    !!origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith('.lovable.app') ||
      origin.endsWith('.lovableproject.com'));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { name, email, subject, message } = await req.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0 || subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid subject' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 10 || message.length > 2000) {
      return new Response(JSON.stringify({ error: 'Message must be between 10 and 2000 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);

    const safeName = escapeHtml(name.trim());
    const safeEmail = escapeHtml(email.trim());
    const safeSubject = escapeHtml(subject.trim());
    const safeMessage = escapeHtml(message.trim()).replace(/\n/g, '<br/>');

    const bodyHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; margin: 0 0 20px;">
        <tr>
          <td style="padding: 12px 14px; color: #71717a; font-size: 13px; width: 90px;">Name</td>
          <td style="padding: 12px 14px; color: #18181b; font-size: 14px; font-weight: 500;">${safeName}</td>
        </tr>
        <tr>
          <td style="padding: 12px 14px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 13px;">Email</td>
          <td style="padding: 12px 14px; border-top: 1px solid #e4e4e7; color: #18181b; font-size: 14px;"><a href="mailto:${safeEmail}" style="color: #2563eb; text-decoration: none;">${safeEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 12px 14px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 13px;">Subject</td>
          <td style="padding: 12px 14px; border-top: 1px solid #e4e4e7; color: #18181b; font-size: 14px;">${safeSubject}</td>
        </tr>
      </table>

      <p style="margin: 0 0 8px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Message</p>
      <div style="padding: 16px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; color: #3f3f46; font-size: 14px; line-height: 1.6;">
        ${safeMessage}
      </div>
    `;

    const emailHtml = buildFleetFlowEmail({
      previewText: `${name.trim()} — ${subject.trim()}`,
      headline: 'New Contact Form Submission',
      bodyText: bodyHtml,
      footerContext: 'Sent from the FleetFlow public contact form.',
    });

    await resend.emails.send({
      from: 'FleetFlow Contact <no-reply@jeanwayusa.com>',
      to: ['hr@jeanwayusa.com'],
      subject: `Contact Form: ${subject.trim()}`,
      html: emailHtml,
      replyTo: email.trim(),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send message' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
