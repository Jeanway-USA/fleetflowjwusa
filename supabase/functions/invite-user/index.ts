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
    origin === allowed || origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an owner
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      console.log('Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if requesting user is an owner
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!roleData) {
      console.log('User is not an owner:', requestingUser.id);
      return new Response(JSON.stringify({ error: 'Only owners can invite users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get request body
    const { email, role, driver_id, first_name, last_name, requires_onboarding } = await req.json();
    const requiresOnboarding = typeof requires_onboarding === 'boolean' ? requires_onboarding : null;
    console.log('Inviting user:', email, 'with role:', role, 'driver_id:', driver_id, 'requires_onboarding:', requiresOnboarding);

    if (!email || !role) {
      return new Response(JSON.stringify({ error: 'Email and role are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate role
    const validRoles = ['owner', 'payroll_admin', 'dispatcher', 'safety', 'driver'];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const roleLabels: Record<string, string> = {
      owner: 'Owner',
      payroll_admin: 'Payroll Admin',
      dispatcher: 'Dispatcher',
      safety: 'Safety',
      driver: 'Driver',
    };

    // Get the requesting user's org_id
    const { data: reqProfile } = await supabaseAdmin
      .from('profiles')
      .select('org_id')
      .eq('user_id', requestingUser.id)
      .single();

    const orgId = reqProfile?.org_id;

    // Resolve the organization's display name for use in email content.
    let orgName = 'your organization';
    if (orgId) {
      const { data: orgRow } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle();
      if (orgRow?.name) orgName = orgRow.name;
    }

    // Invite links must ALWAYS point to the production custom domain,
    // regardless of where the owner sent the invite from (preview, editor,
    // localhost). Recipients should never land on a preview URL.
    const appUrl = 'https://tms.jeanwayusa.com';

    // Check if user already exists in auth. listUsers() is paginated (default 50/page),
    // so iterate until we find a match or run out of pages — otherwise users beyond the
    // first page would fall through to the "new user" branch and bypass the cross-org
    // hijack guard below.
    let existingUser: { id: string; email?: string | null } | null = null;
    const PER_PAGE = 1000;
    for (let page = 1; page <= 100; page++) {
      const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (listErr) {
        console.error('listUsers error:', listErr.message);
        break;
      }
      const users = pageData?.users ?? [];
      const match = users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
      if (match) {
        existingUser = match;
        break;
      }
      if (users.length < PER_PAGE) break; // last page
    }

    // Defense-in-depth: also look up by email in profiles, in case auth.listUsers
    // pagination missed them but a profile already exists.
    let existingProfileUserId: string | null = null;
    if (!existingUser) {
      const { data: profileMatch } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .ilike('email', email)
        .maybeSingle();
      existingProfileUserId = profileMatch?.user_id ?? null;
    }

    const isExistingUser = !!existingUser || !!existingProfileUserId;
    const existingUserId = existingUser?.id ?? existingProfileUserId ?? null;

    let targetUserId: string | null = null;
    let inviteActionLink: string | null = null;

    // ─────────────────────────────────────────────────────────────
    // EXISTING USER PATH: create a pending invitation row and send
    // a tailored email. Do NOT auto-add to org or assign roles —
    // that happens when they accept the invitation.
    // ─────────────────────────────────────────────────────────────
    if (isExistingUser) {
      if (!orgId) {
        return new Response(
          JSON.stringify({ error: 'Inviting user has no organization.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Existing user detected — creating pending invitation:', email);

      // Upsert-like behavior: if a pending invitation already exists for
      // (email, org_id), refresh it instead of failing on the unique index.
      const { data: existingPending } = await supabaseAdmin
        .from('invitations')
        .select('id, token')
        .eq('org_id', orgId)
        .ilike('email', email)
        .eq('status', 'pending')
        .maybeSingle();

      let invitationId: string | null = null;
      let invitationToken: string | null = null;

      if (existingPending) {
        const { data: updated, error: updErr } = await supabaseAdmin
          .from('invitations')
          .update({
            role,
            driver_id: driver_id ?? null,
            requires_onboarding: requiresOnboarding ?? false,
            invited_user_id: existingUserId,
            is_existing_user: true,
            invited_by: requestingUser.id,
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', existingPending.id)
          .select('id, token')
          .single();
        if (updErr) {
          console.error('Invitation refresh error:', updErr.message);
          throw updErr;
        }
        invitationId = updated.id;
        invitationToken = updated.token;
      } else {
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from('invitations')
          .insert({
            email: email.toLowerCase(),
            org_id: orgId,
            role,
            driver_id: driver_id ?? null,
            requires_onboarding: requiresOnboarding ?? false,
            invited_by: requestingUser.id,
            invited_user_id: existingUserId,
            is_existing_user: true,
          })
          .select('id, token')
          .single();
        if (insErr) {
          console.error('Invitation insert error:', insErr.message);
          throw insErr;
        }
        invitationId = inserted.id;
        invitationToken = inserted.token;
      }

      // Tailored email for existing users.
      const acceptLink = `${appUrl}/auth/accept-invite?token=${invitationToken}`;
      const existingUserHtml = buildFleetFlowEmail({
        previewText: `Accept your invitation to join ${orgName}`,
        headline: `You've been invited to join ${orgName}`,
        bodyText: `You have been invited to join ${orgName} as a ${roleLabels[role]} on the FleetFlow TMS platform. Log in to accept the invitation and switch to this organization.`,
        buttonText: 'Review Invitation',
        buttonUrl: acceptLink,
        footerContext: `This invitation expires in 14 days. If you weren't expecting it, you can safely ignore this email.`,
      });

      let existingResendId: string | null = null;
      try {
        const emailResponse = await resend.emails.send({
          from: 'Fleet Flow TMS <no-reply@jeanwayusa.com>',
          to: [email],
          subject: `You've been invited to join ${orgName} on FleetFlow TMS`,
          html: existingUserHtml,
        });
        // @ts-ignore
        existingResendId = emailResponse?.data?.id ?? null;
        // @ts-ignore
        if (emailResponse?.error) console.error('Resend error (existing user):', emailResponse.error);
      } catch (emailError) {
        console.error('Resend email error (existing user, thrown):', emailError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          is_existing_user: true,
          invitation_id: invitationId,
          message: `Invitation sent to ${email}. They'll need to accept it to join your organization.`,
          resend_message_id: existingResendId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // NEW USER PATH: create auth user via generateLink, link org,
    // assign role, send standard branded invite email.
    // ─────────────────────────────────────────────────────────────
    {
      const acceptUrl = `${appUrl}/auth/accept-invite`;
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: {
            invited_role: role,
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            requires_onboarding: requiresOnboarding ?? false,
          },
          redirectTo: acceptUrl,
        },
      });

      if (inviteError) {
        console.error('Supabase invite error:', inviteError.message);
        throw inviteError;
      }

      targetUserId = inviteData.user?.id ?? null;
      inviteActionLink = inviteData.properties?.action_link ?? null;
      console.log('User invited via Supabase:', targetUserId);

      if (targetUserId) {
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('org_id')
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (targetProfile?.org_id && orgId && targetProfile.org_id !== orgId) {
          return new Response(
            JSON.stringify({ error: 'This user already belongs to another organization.' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (orgId) {
          await supabaseAdmin
            .from('profiles')
            .update({ org_id: orgId })
            .eq('user_id', targetUserId)
            .is('org_id', null);
        }

        if (requiresOnboarding !== null) {
          await supabaseAdmin
            .from('profiles')
            .update({ requires_onboarding: requiresOnboarding })
            .eq('user_id', targetUserId);
        }
      }
    }


    // Ensure first/last name are stored on the profile so onboarding renders
    // the correct printed name instead of falling back to the email prefix.
    if (targetUserId && (first_name || last_name)) {
      const profileUpdates: Record<string, string> = {};
      if (first_name) profileUpdates.first_name = first_name;
      if (last_name) profileUpdates.last_name = last_name;
      const { error: nameError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('user_id', targetUserId);
      if (nameError) console.error('Profile name update error:', nameError.message);
    }

    // Assign role (upsert to avoid duplicates)
    if (targetUserId) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .upsert(
          { user_id: targetUserId, role, org_id: orgId },
          { onConflict: 'user_id,role' }
        );
      
      if (roleError) {
        console.error('Error assigning role:', roleError.message);
      } else {
        console.log('Role assigned:', role);
      }
    }

    // For driver invites, ensure a drivers row exists and is linked to the auth user
    if (targetUserId && role === 'driver' && orgId) {
      try {
        let linkedDriverId: string | null = null;

        if (driver_id) {
          // Link the provided driver row to this auth user (only if currently unlinked)
          const { data: updated, error: updErr } = await supabaseAdmin
            .from('drivers')
            .update({ user_id: targetUserId })
            .eq('id', driver_id)
            .eq('org_id', orgId)
            .is('user_id', null)
            .select('id')
            .maybeSingle();
          if (updErr) console.error('Driver link error:', updErr.message);
          linkedDriverId = updated?.id ?? driver_id;
        } else {
          // Try to find an existing driver row by email in this org
          const { data: existingDriver } = await supabaseAdmin
            .from('drivers')
            .select('id, user_id')
            .eq('org_id', orgId)
            .ilike('email', email)
            .maybeSingle();

          if (existingDriver) {
            if (!existingDriver.user_id) {
              await supabaseAdmin
                .from('drivers')
                .update({ user_id: targetUserId })
                .eq('id', existingDriver.id);
            }
            linkedDriverId = existingDriver.id;
          } else {
            // Create a new driver row linked to this user
            const { data: inserted, error: insErr } = await supabaseAdmin
              .from('drivers')
              .insert({
                org_id: orgId,
                user_id: targetUserId,
                first_name: first_name || email.split('@')[0],
                last_name: last_name || '',
                email,
                status: 'active',
                pay_type: 'percentage',
                pay_rate: 0,
              })
              .select('id')
              .single();
            if (insErr) {
              console.error('Driver create error:', insErr.message);
            } else {
              linkedDriverId = inserted?.id ?? null;
            }
          }
        }

        console.log('Driver record linked:', linkedDriverId);
      } catch (driverLinkErr) {
        console.error('Driver linking exception:', driverLinkErr);
      }
    }

    // Send custom email via Resend
    const signUpLink = inviteActionLink ?? `${appUrl}/auth`;
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Fleet Flow TMS</h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">by JeanWayUSA</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 24px; font-weight: 600;">You're Invited!</h2>
              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                You've been invited to join <strong>Fleet Flow TMS</strong> as a <strong style="color: #D97706;">${roleLabels[role]}</strong>.
              </p>
              
              <p style="margin: 0 0 32px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Click the button below to accept your invitation and set up your account:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${signUpLink}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0; color: #6a6a6a; font-size: 14px; line-height: 1.6;">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
              
              <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e5e5;">
              
              <p style="margin: 0; color: #9a9a9a; font-size: 12px; line-height: 1.6;">
                This invitation was sent by an administrator at Fleet Flow TMS. If you have questions, please contact your administrator.
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
</html>
    `;

    let resendMessageId: string | null = null;

    try {
      const emailResponse = await resend.emails.send({
        from: 'Fleet Flow TMS <no-reply@jeanwayusa.com>',
        to: [email],
        subject: `You're invited to join Fleet Flow TMS`,
        html: emailHtml,
      });

      // Resend v4 returns { data, error }
      // When error is null, the request was accepted and queued for delivery.
      // Delivery status (delivered/bounced/complained) can be checked in Resend events using the id.
      // @ts-ignore - keep runtime safe even if typings differ
      resendMessageId = emailResponse?.data?.id ?? null;
      console.log('Email sent via Resend:', emailResponse);

      // @ts-ignore
      if (emailResponse?.error) {
        // @ts-ignore
        console.error('Resend returned an error payload:', emailResponse.error);
      }
    } catch (emailError) {
      console.error('Resend email error (thrown):', emailError);
      // Don't fail the whole request if email fails - user was still invited
    }

    return new Response(JSON.stringify({
      success: true,
      is_existing_user: false,
      message: `Invitation sent to ${email}`,
      user_id: targetUserId,
      already_registered: false,
      resend_message_id: resendMessageId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error inviting user:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred while sending the invitation.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
