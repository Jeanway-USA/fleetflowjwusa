
## 1. Remove the two "Coming soon" placeholder checkboxes

In `src/components/onboarding/DocumentSignatureStep.tsx`:
- Delete `SHARED_PLACEHOLDERS`, the `PlaceholderDocumentCard` component, the `placeholderAcks` state, and the shared-placeholder rendering block under Shared Documents.
- Drop `sharedPlaceholdersValid` from the aggregate validity effect.

Those two documents (Company Safety Policy, Equipment Use Agreement) now come from real templates the user created in Settings — the driver will see and sign them like any other template, no acknowledge-later checkbox needed.

## 2. Toggle "who signs it" per template (1099 / W-2 / Both)

### Database

Add an `applies_to` column to `document_templates`:
- Type: text with a check constraint of `'shared' | 'w2' | '1099'`
- Default: `'shared'` (so existing rows keep showing to every driver)
- Backfill: any row whose `document_type` is `direct_deposit` gets `'w2'`; everything else stays `'shared'`.

### Settings UI (`DocumentTemplatesPanel.tsx`)

Add an "Audience" selector under the Active toggle:
- Options: **All drivers**, **W-2 employees only**, **1099 contractors only**
- Persisted in the same save mutation.
- Shown as a small badge (e.g. `W-2 only`) next to each item in the template dropdown so admins can tell them apart at a glance.

### Onboarding filter (`DriverOnboarding.tsx` + `DocumentSignatureStep.tsx`)

- Templates query stops filtering by hardcoded `DOCUMENT_ORDER`. It fetches every active template for the org, ordered by `document_type`.
- `DocumentSignatureStep` categorizes by the new `applies_to` field instead of the hardcoded `SHARED_DOCUMENT_TYPES` / `W2_DOCUMENT_TYPES` / `CONTRACTOR_DOCUMENT_TYPES` arrays:
  - `applies_to = 'shared'` → Shared Documents section
  - `applies_to = 'w2'` → W-2 section (only visible when driver picks W-2)
  - `applies_to = '1099'` → 1099 section (only visible when driver picks 1099)

The existing `W2Documents` / `ContractorDocuments` form widgets (W-4, I-9, W-9, etc.) stay exactly as they are.

## 3. Fix "saved documents, then it made me fill them out again"

Root cause: after a successful submit, the success screen only lives in memory. If the driver refreshes, `signedResults` is `null`, `state` is empty, and the flow reopens every template from scratch — none of the previously entered fields (address, SSN, banking, signature) are rehydrated because they were never persisted as draft data.

Fix — skip already-signed templates instead of re-collecting them:

- In `DriverOnboarding.tsx`, treat any template that already has a row in `driver_signed_documents` with `review_status` in (`pending`, `approved`) as **done**:
  - Filter it out of the `templates` list passed to `DocumentSignatureStep` (unless we're in revision mode and its status is `revision_requested`).
  - Skip it in `finalizeSubmission` so we never try to upload a second copy.
- In the same load effect, if every active template + every required employment-specific form is already on file and nothing is in `revision_requested`, auto-navigate the driver straight to `/driver-dashboard` instead of showing the empty onboarding wizard.
- Show a small "Already submitted — waiting on admin review" summary card at the top of the Documents step listing anything that's on file but not yet approved, so the driver knows why it's not in their to-do list.

This means a refresh after a successful submit lands on either the dashboard (if everything is signed) or a shortened wizard that only asks for what's genuinely missing / needs revision. No previously-signed document is ever shown as an empty form again.

## Out of scope

- No changes to signature PDF generation, storage paths, RLS, or the admin review workflow in `SignedOnboardingDocuments.tsx`.
- Existing template content, driver rows, and any already-signed PDFs are untouched.
- No change to the W-4 / I-9 / W-9 form widgets themselves.

## Technical notes

- Migration: `ALTER TABLE public.document_templates ADD COLUMN applies_to text NOT NULL DEFAULT 'shared' CHECK (applies_to IN ('shared','w2','1099'));` plus a one-time `UPDATE` to mark `direct_deposit` rows as `'w2'`. Types file regenerates after approval.
- Because we now render whatever active templates the org has, the hardcoded `DOCUMENT_ORDER`, `DOCUMENT_LABELS`, and `DocumentTypeKey` constants in `DriverOnboarding.tsx` collapse into a single `templates.map(...)` loop keyed on `template.document_type`.
