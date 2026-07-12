## Problem

W-4, W-9, I-9, and State Tax forms are **hard-coded onboarding steps**, not rows in `document_templates`. The current "outstanding documents" detector (`src/lib/onboarding/outstanding.ts`) only looks at `document_templates`, so a driver hired **before** these forms existed has no signed row *and* no template row → the admin sees nothing missing and has no way to trigger a re-sign.

The existing `SignedOnboardingDocuments` component already has a working "Request Revision" flow for signed docs and a "Notify driver" flow for outstanding templates — we just need to teach it that the four built-in tax forms are always required (based on employment type) and expose the same notify action for them.

## Plan

### 1. Extend outstanding detection to built-in tax forms
`src/lib/onboarding/outstanding.ts`

- After loading `document_templates`, synthesize a list of **built-in required forms** based on `driver.employment_type`:
  - `w2_company` → `w4`, `i9`, `state_tax`, `direct_deposit`
  - otherwise (1099 / owner-op) → `w9`, `ioo_agreement`
- Merge them into the same `OutstandingTemplate[]` shape with a synthetic marker (e.g. `id: 'builtin:w4'`, `applies_to` set to the audience).
- Exclude any whose `document_type` already appears in `driver_signed_documents`.
- These built-ins are additive to whatever admin-created templates are also unsigned.

### 2. Notify flow already works
`SignedOnboardingDocuments.tsx` renders every item returned by `fetchOutstandingTemplates` in the amber "Outstanding documents" panel with a **Notify driver** button. Once step 1 lands, W-4 / W-9 / I-9 / State Tax appear there automatically for legacy drivers.

Small polish in the same file:
- Use the friendly labels from `DOCUMENT_LABELS` when a built-in has no `name`.
- Show a subtle "Built-in" badge (vs "All / W-2 / 1099") so admins know it's a system form, not a template they can edit.

### 3. Driver-side prompt already works
`OnboardingRevisionBanner` already counts `fetchOutstandingTemplates(...).templates.length` and deep-links the driver to `/driver/onboarding?docs=1`. `DriverOnboarding` already knows how to render W-4/W-9/I-9/State Tax steps by employment type, so a legacy driver clicking the banner lands on the correct forms without additional wiring.

### 4. Verification
- Load a driver whose `employment_type='w2_company'` with **no** `driver_signed_documents` rows for `w4` / `i9` / `state_tax` → admin sees them in the amber "Outstanding documents" panel with a Notify button.
- After clicking Notify, driver dashboard shows the red "Action Required" banner and the deep link opens `/driver/onboarding?docs=1`.
- Once the driver signs, the row disappears from Outstanding and moves into the normal signed-docs list where the existing **Request Revision** button already works.

## Technical notes

- No DB schema change. No new tables. No RLS changes.
- Built-in items use a synthetic `id` prefix so React keys stay unique and the notify mutation just needs `document_type` + `name` (which it already does).
- 1099 contractors keep seeing `w9` / `ioo_agreement` as outstanding, W-2 drivers see `w4` / `i9` / `state_tax` / `direct_deposit` — matches the existing hard-coded onboarding step gating.
