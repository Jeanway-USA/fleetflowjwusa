
## Root cause

Onboarding is one-shot. Once `profiles.onboarding_completed = true`, nothing surfaces newly-required documents to the driver, and admins have no way to request signatures on templates the driver never signed. The existing "Request Revision" flow in `SignedOnboardingDocuments.tsx` only works on rows that already exist in `driver_signed_documents` — so a template a driver was never prompted for can't be revised, requested, or completed.

Result:
- **Older driver (pre-templates):** admin sees no rows for the new templates → no "Request Revision" button → no way to ask for a signature.
- **Newer driver (1 unsigned template):** onboarding is marked complete, banner only fires on `revision_requested` rows, so the driver never sees a prompt for the still-missing template.
- **General:** any template added in Settings after a driver completes onboarding is invisible to them forever.

## Fix

### 1. Compute "outstanding templates" everywhere

Add a shared helper (`src/lib/onboarding/outstanding.ts`) that, given a driver id + `employment_type`, returns the list of active `document_templates` whose `applies_to` matches the driver AND that have no `driver_signed_documents` row (or only a `revision_requested` row). This is the single source of truth used by the driver banner, driver dashboard, admin panel, and the onboarding page.

### 2. Driver-side prompt (fixes the "isn't seeing a prompt" bug)

`src/components/driver/OnboardingRevisionBanner.tsx`:
- In addition to counting `revision_requested` rows, also count outstanding templates from the helper above.
- When the total > 0, render the red banner with a "Complete Documents" button that navigates to `/driver/onboarding?docs=1`.
- Copy adapts: "1 document needs your signature" vs. "revision on N items."

`src/pages/DriverOnboarding.tsx`:
- Accept a `?docs=1` query param. When present AND the driver already has `employment_type` set AND credentials are not in `revision_requested`, deep-link straight to the Documents step (skipping Employment + Credentials) and only render the outstanding templates. This reuses the `pendingTemplates` filter already in place.
- Do NOT flip `onboarding_completed` back to false; just let the driver visit the route directly (the route is not gated once complete, only redirected TO if incomplete).
- On successful submission of the outstanding docs, stay on the dashboard — do not reset `onboarding_completed`.

### 3. Admin-side "Request signing" (fixes the "can't request completion" bug)

`src/components/drivers/SignedOnboardingDocuments.tsx`:
- Above the existing signed-doc list, add an **"Outstanding documents"** section that lists every active template with no signed row for this driver (using the helper above).
- Each row shows the template name + audience badge + a **"Notify driver"** button.
- Clicking it inserts a row into `driver_notifications` (existing table) with a link back to `/driver/onboarding?docs=1`, so the driver gets the standard in-app notification plus the banner covered in step 2 above.
- Also show a small count badge on the Onboarding tab of `DriverDetailSheet.tsx` so admins see at a glance which drivers have unsigned templates.

### 4. Small consistency fixes

- `DocumentSignatureStep.tsx`: if `pendingTemplates` is empty AND the employment-specific structured forms (W-4/I-9/W-9/IOO) are already on file (query `driver_w4_info` / `driver_i9_info` / `driver_w9_info` / `driver_ioo_agreement` for existence), auto-satisfy validity so the driver isn't stuck on an empty screen with a disabled Submit button when only structured forms remain.
- No schema changes required. All queries hit existing tables (`document_templates`, `driver_signed_documents`, `driver_notifications`).

## Out of scope

- No changes to onboarding step order, the credentials step, PDF generation, RLS, or storage paths.
- No changes to `onboarding_completed` semantics — it still gates first-time onboarding and nothing else.
- No changes to the "revision requested" review workflow itself; it continues to work as-is.

## Technical notes

- Outstanding-templates query pattern:
  ```
  document_templates WHERE org_id = ? AND is_active AND applies_to IN ('shared', <driver audience>)
  LEFT JOIN driver_signed_documents ON document_type
  WHERE latest signed_at row is null OR review_status = 'revision_requested'
  ```
  Implement via two selects + client-side diff (avoids adding a Postgres view).
- Driver-audience mapping mirrors what `DriverOnboarding.tsx` already does: `employment_type = 'w2_company'` → `w2`; anything else → `1099`; `shared` always included.
