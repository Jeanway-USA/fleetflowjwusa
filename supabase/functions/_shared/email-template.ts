// Shared HTML email template builder for FleetFlow Edge Functions.
// Produces a responsive, modern SaaS-style email (DocuSign / Vercel inspired).

export interface BuildFleetFlowEmailParams {
  /** Hidden preview text shown in inbox previews (Gmail, Apple Mail, etc.) */
  previewText: string;
  /** Large headline at the top of the content card */
  headline: string;
  /**
   * Main body content. Plain text is auto-wrapped into <p> tags (split on blank lines).
   * If the string contains HTML tags, it is rendered as-is. Trust your caller.
   */
  bodyText: string;
  /** Optional CTA button label. Button only renders when both buttonText and buttonUrl are provided. */
  buttonText?: string;
  /** Optional CTA button destination URL. */
  buttonUrl?: string;
  /** Optional footer note explaining why the recipient is getting this email. */
  footerContext?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function looksLikeHtml(str: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(str);
}

function renderBody(bodyText: string): string {
  if (looksLikeHtml(bodyText)) return bodyText;
  return bodyText
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.6;">${escapeHtml(
          para,
        ).replace(/\n/g, '<br />')}</p>`,
    )
    .join('\n');
}

export function buildFleetFlowEmail(params: BuildFleetFlowEmailParams): string {
  const { previewText, headline, bodyText, buttonText, buttonUrl, footerContext } = params;

  const hasButton = !!(buttonText && buttonUrl);
  const buttonHtml = hasButton
    ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 8px;">
              <tr>
                <td align="left" style="border-radius: 8px; background-color: #2563eb;">
                  <a href="${escapeHtml(buttonUrl!)}"
                     style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.1px;">
                    ${escapeHtml(buttonText!)}
                  </a>
                </td>
              </tr>
            </table>`
    : '';

  const footerContextHtml = footerContext
    ? `<p style="margin: 0 0 12px; color: #71717a; font-size: 13px; line-height: 1.6;">${escapeHtml(
        footerContext,
      )}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all; font-size: 1px; line-height: 1px; color: #f4f4f5;">
    ${escapeHtml(previewText)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- Brand header -->
          <tr>
            <td align="left" style="padding: 0 4px 20px;">
              <span style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #18181b; letter-spacing: -0.3px;">
                Fleet<span style="color: #2563eb;">Flow</span>
              </span>
            </td>
          </tr>

          <!-- Content card -->
          <tr>
            <td style="background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #18181b; font-size: 24px; font-weight: 700; line-height: 1.3; letter-spacing: -0.4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                ${escapeHtml(headline)}
              </h1>
              ${renderBody(bodyText)}
              ${buttonHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 4px 0;">
              ${footerContextHtml}
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                © ${new Date().getFullYear()} FleetFlow TMS by JeanWayUSA. All rights reserved.
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
