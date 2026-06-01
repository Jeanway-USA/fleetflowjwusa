## Goal

Unify the look of all Resend-sent emails by routing them through the shared `buildFleetFlowEmail` template in `supabase/functions/_shared/email-template.ts`, matching the pattern already established in `invite-user`.

## Functions to update

1. `supabase/functions/send-invoice-email/index.ts`
2. `supabase/functions/send-carrier-packet/index.ts`
3. `supabase/functions/email-load-status/index.ts`
4. `supabase/functions/contact-form/index.ts` (also calls Resend)

No business logic, auth, RLS, or DB queries change. Only the email HTML construction + subject framing.

## Changes per function

### 1. `send-invoice-email`
- Import `buildFleetFlowEmail` from `../_shared/email-template.ts`.
- Delete the local `buildInvoiceEmailHtml` function.
- Keep all existing data gathering (org, broker, line items, totals, dates).
- Build an HTML body string that preserves the itemized invoice (Bill To, Load Reference, Origin/Destination, line-item table with Total) using the same minimal inline-styled table markup, then pass it as `bodyText` (it will be detected as HTML and rendered as-is).
- Call:
  - `headline`: `New Invoice from ${orgName}`
  - `previewText`: `Invoice ${invoiceNumber} for load ${loadDisplayId}`
  - `buttonText`: `View Load Details`
  - `buttonUrl`: public tracking URL (`https://fleetflowjwusa.lovable.app/track?tracking_id=${load.tracking_id}`), only set if `load.tracking_id` exists; otherwise omit button
  - `footerContext`: `You're receiving this invoice because your agency code is linked to this load in ${orgName}'s TMS.`
- Subject unchanged: `Invoice ${invoiceNumber} — ${loadDisplayId} | ${orgName}`.

### 2. `send-carrier-packet`
- Import `buildFleetFlowEmail`. Delete local `buildCarrierPacketHtml`.
- Build HTML body containing: the sender's message (paragraphs with `<br/>` line breaks, escaped) followed by an "Attached Documents" section rendering each `docLinks` entry as `<a href="signedUrl">label</a>` list items.
- Call:
  - `headline`: `Carrier Onboarding Packet`
  - `previewText`: `Carrier packet from ${orgName}`
  - No `buttonText` / `buttonUrl` (per user choice — links live in the body)
  - `footerContext`: `Download links expire in 1 hour for security.`
- Subject unchanged: `Carrier Packet — ${orgName}`.

### 3. `email-load-status`
- Import `buildFleetFlowEmail`. Delete local `buildEmailHtml`.
- Body content: greeting (if `agentName`), short "Status update for one of your loads" line, then an HTML block showing Load Ref, Current Status (plain text — drop the colored pill chip since the unified template is single-accent), Pickup, Delivery, and optional Driver Location.
- Call:
  - `headline`: `Load #${loadDisplayId} — ${statusLabel}`
  - `previewText`: `Status update: ${statusLabel}`
  - `buttonText`: `Track This Load Live`, `buttonUrl`: `trackingUrl` (only when present)
  - `footerContext`: `Automated update from ${orgName} via FleetFlow TMS. To stop receiving these for this load, ask your dispatcher to disable Auto Email Updates.`
- Drop the `STATUS_COLORS` map (no longer needed); keep `STATUS_LABELS`.
- Subject unchanged: `Load #${loadDisplayId}: Status Update — ${statusLabel}`.

### 4. `contact-form`
- Import `buildFleetFlowEmail`.
- Replace the inline HTML for the HR notification with `buildFleetFlowEmail`:
  - `headline`: `New Contact Form Submission`
  - `previewText`: `${name} — ${subject}`
  - `bodyText`: HTML block with Name / Email / Subject rows + the message in a quoted block (escaped, `\n` → `<br/>`)
  - No button.
  - `footerContext`: `Sent from the FleetFlow public contact form.`
- Subject unchanged: `Contact Form: ${subject}`.
- Keep `replyTo: email.trim()`.

## "Resend usage matches invite-user"

`invite-user` already uses `new Resend(resendApiKey).emails.send({ from, to, subject, html, replyTo? })` after reading `RESEND_API_KEY` from env. The four target functions already follow this exact shape — no changes needed to the Resend call site itself other than swapping the `html` value to the unified template output. `from` addresses, auth checks, CORS, and error handling stay as-is.

## Out of scope

- No DB migrations.
- No changes to `_shared/email-template.ts` (the existing `bodyText` HTML-passthrough behavior already supports the richer invoice/status/packet bodies).
- No changes to callers in the frontend.
- No switch to Lovable Emails / queue — request is explicitly to keep Resend.

## Verification

After the edits, deploy the four functions and spot-check by reading the final files to confirm:
- Each imports `buildFleetFlowEmail`.
- No local `build*Html` helpers remain.
- Resend `.emails.send({ html })` receives the template output.
