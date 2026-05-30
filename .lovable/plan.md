# Fix: Direct Deposit step skipped during driver onboarding

## Root cause

The onboarding pagination logic in `src/pages/DriverOnboarding.tsx` is actually correct — `totalSteps = templates.length + 1` and `stepIndex === totalSteps - 1` properly advances through every fetched template. The real bug is upstream in the data fetch.

- `DOCUMENT_ORDER` (and the `.in('document_type', ...)` filter) expects: `['driver_agreement', 'direct_deposit']`
- The actual row in `document_templates` uses `document_type = 'direct_deposit_form'`
- Result: only the Driver Agreement is returned, `templates.length === 1`, so after signing it the flow correctly hits the last step and finalizes — there is no second template to advance to.

The `DocumentTemplatesPanel` admin UI documents the canonical slug as `direct_deposit`, and `DriverOnboarding.tsx` keys off `direct_deposit` in three places (DOCUMENT_ORDER, DOCUMENT_LABELS, and the `direct_deposit_attachment_url` persistence branch). The DB row is the outlier.

## Fix

Normalize the slug in the database so the existing code (which is already array-driven and already supports N templates) picks it up.

### 1. Migration

Rename any stray `direct_deposit_form` rows to the canonical slug:

```sql
UPDATE public.document_templates
SET document_type = 'direct_deposit'
WHERE document_type = 'direct_deposit_form';
```

### 2. No code changes required

After verifying in the preview, confirm that:

- `useQuery(['driver_onboarding_templates', orgId])` returns both templates.
- `totalSteps` becomes 3 (credentials + 2 documents).
- Submitting the Driver Agreement advances to Direct Deposit instead of finalizing.
- Only after submitting Direct Deposit does `finalizeSubmission` run, write `profiles.onboarding_completed = true`, and render the success/download screen.

## Why not change the code constants instead

Changing `DOCUMENT_ORDER`/labels to `direct_deposit_form` would also work, but:
- The admin-facing docs in `DocumentTemplatesPanel.tsx` already advertise `direct_deposit` as the canonical type.
- `direct_deposit_attachment_url` persistence is keyed off `direct_deposit`.
- Any future template seeded through the admin UI will use `direct_deposit`, re-breaking the flow.

Normalizing the DB row is the durable fix.

## Out of scope

No changes to pagination, success screen, `onboarding_completed` write, or storage paths — they are already correct once the second template is actually fetched.
