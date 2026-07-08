## New tokens

Add six new template tokens to `src/lib/documents/hydrateTokens.ts`:

- `{{driver_printed_name}}`, `{{driver_title}}`, `{{driver_date_signed}}`
- `{{owner_printed_name}}`, `{{owner_title}}`, `{{owner_date_signed}}`

Resolution rules in `buildTokenMap`:

- `*_printed_name` / `*_title` / `*_date_signed` pull from `instance.metadata` when present (populated at signing time — see below). Falls back to blank so `extractUnresolvedTokens` reports them.
- `driver_printed_name` also falls back to the current `driver_name` value.
- Add these to the "handled by inputs" delete list in `extractUnresolvedTokens` — they'll be prompted by the signing panel, not the generic missing-token loop.

## Signing panel prompts

In `src/pages/DocumentSigningWorkspace.tsx`, when `canSignNow`:

- Show three new required inputs above the signature pad: **Printed Name**, **Title**, **Date Signed**.
- Pre-fill:
  - Printed Name = signer's profile full name (already fetched).
  - Title = user's last-used title, read from a new `profiles.default_signing_title` column (see below). Blank if none.
  - Date Signed = today's date, read-only display, editable if the signer needs to override.
- On submit, block signing until all three are filled.
- Persist all three onto `document_instances.metadata` under role-scoped keys derived from the current step's `stepRole`:
  - `${role}_printed_name`, `${role}_title`, `${role}_date_signed` (e.g. `owner_printed_name`).
- Also write the entered title back to `profiles.default_signing_title` so it pre-fills next time.

## Profile column

Migration to add nullable `default_signing_title text` to `public.profiles`. No policy changes needed — existing profile policies already gate reads/writes.

## Template renderer support

Update `src/components/onboarding/DocumentTemplateRenderer.tsx` and `src/lib/onboarding/generateSignedPdf.ts` so their token regexes recognize the six new names and render them as inline text (they behave like normal string tokens, not block signatures).

## Legacy PDF overlay (`composeCompletedPdf`)

Extend the owner-signature overlay branch in `src/lib/documents/composeCompletedPdf.ts`:

- After drawing the owner signature PNG at each `[Owner Signature Pending]` hit, draw three text lines directly beneath the image using `pdf-lib`'s standard Helvetica font, matching the reference screenshot style:
  - `Printed Name: <owner_printed_name>`
  - `Title: <owner_title>`
  - `Date Signed: <owner_date_signed>`
- Pull values from `document_instances.metadata` (already loaded in the compose flow).
- Extend the white-rectangle mask height so it covers any residual layout the placeholder occupied; text lines render below the signature, ~10pt with 12pt line height, clamped to page bounds.
- No driver-side legacy overlay — driver signature has no `Pending` marker to anchor to and the driver's printed name/title are baked into their original signed PDF (or absent).

## Files touched

- `supabase/migrations/*.sql` — add `profiles.default_signing_title`.
- `src/lib/documents/hydrateTokens.ts` — six new tokens + unresolved-token filtering.
- `src/pages/DocumentSigningWorkspace.tsx` — new inputs, validation, metadata write, profile update.
- `src/components/onboarding/DocumentTemplateRenderer.tsx` — token regex.
- `src/lib/onboarding/generateSignedPdf.ts` — token regex + rendering case.
- `src/lib/documents/composeCompletedPdf.ts` — printed name/title/date text under overlaid owner signature.

## Out of scope

Existing already-completed instances won't retroactively gain printed name/title (metadata wasn't captured). New signings from this point forward will render them everywhere.
