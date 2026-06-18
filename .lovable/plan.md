## Goal
Let admins reject specific onboarding artifacts (credentials, driver agreement, direct deposit, future templates) with a written reason, alert the driver, and deep‑link them back to fix only that step — no full restart.

## Step model
Onboarding currently has two kinds of steps:
- **Credentials step** — saved on the `drivers` row (license, medical card, banking screen, etc.).
- **Document steps** — one row per signed template in `driver_signed_documents` (`document_type` = `driver_agreement`, `direct_deposit`, plus any future templates).

To stay generic (Task 1 asks for per-step statuses, not hard-coded columns), we'll track review status on each artifact, not as a fixed list of columns.

## Task 1 — Database

Migration adds review tracking in two places:

1. New enum `onboarding_review_status` with values `pending`, `approved`, `revision_requested`.
2. On `public.driver_signed_documents`:
   - `review_status onboarding_review_status NOT NULL DEFAULT 'pending'`
   - `revision_notes text`
   - `reviewed_by uuid` (auth user), `reviewed_at timestamptz`
3. On `public.drivers` (for the credentials step, which isn't a signed doc):
   - `credentials_review_status onboarding_review_status NOT NULL DEFAULT 'pending'`
   - `credentials_revision_notes text`
   - `credentials_reviewed_by uuid`, `credentials_reviewed_at timestamptz`
4. RLS update on `driver_signed_documents`: drivers may read `review_status` / `revision_notes` for their own rows (already covered by existing per-driver SELECT policy — verify and extend if needed). Admin update policy (owner / safety / payroll_admin) for the new review columns.
5. Trigger on `driver_signed_documents`: when the row's `file_path` changes (driver re-uploads/re-signs) and `review_status = 'revision_requested'`, flip it back to `pending` and clear `revision_notes`. Same on `drivers` for the credentials columns when license/medical/banking fields change.

No data loss: `profiles.onboarding_completed` stays as-is so existing gating keeps working.

## Task 2 — Admin "Request Revision" UI

Edit `src/components/drivers/SignedOnboardingDocuments.tsx`:
- Show a status pill per document (`Pending review`, `Approved`, `Revision requested`).
- Add **Approve** and **Request Revision** buttons (admin only — same `canView` gate).
- New component `RequestRevisionDialog` — textarea for the reason (required, ≤500 chars), Confirm/Cancel. On submit: `UPDATE driver_signed_documents SET review_status='revision_requested', revision_notes=…, reviewed_by=auth.uid(), reviewed_at=now()`.
- Approve action sets `review_status='approved'`, clears notes.
- In `DriverDetailSheet.tsx`, add a parallel "Credentials" review card (above signed documents) using the same dialog, writing to `drivers.credentials_*`.
- Invalidate `['driver_signed_documents', driverId]` and `['drivers']` queries after each action.

## Task 3 — Driver dashboard alert banner

In `src/pages/DriverDashboard.tsx`, add a query `['onboarding-revisions', driver.id]` that returns:
- `drivers.credentials_review_status = 'revision_requested'` (already in `driver`), and
- any `driver_signed_documents` rows for this driver with `review_status='revision_requested'`.

If `count > 0`, render a non-dismissible red banner at the very top (above the greeting): destructive bg, white text, `AlertTriangle` icon, copy "Action Required: Your onboarding requires a revision." with a **View Details** button that routes to `/driver-onboarding?revision=1`.

## Task 4 — Deep‑link the onboarding flow

Edit `src/pages/DriverOnboarding.tsx`:
- On mount, when `?revision=1` (or always, as a safer default), fetch the driver's `credentials_review_status` + revision rows from `driver_signed_documents`.
- Pick the first step that needs revision in flow order (credentials first, then templates in current order) and `setStepIndex` to it, skipping the normal "start at 0" behavior. Steps already `approved` are skipped via Next button advancing to the next non-approved step.
- At the top of that step, render a prominent destructive alert with the admin's `revision_notes` ("Revisions requested by your administrator: …").
- On resubmit:
  - Credentials step: after the existing `drivers` upsert, also set `credentials_review_status='pending'`, clear `credentials_revision_notes`. (The trigger from Task 1 also enforces this if any tracked field changed.)
  - Document step: after inserting the new `driver_signed_documents` row (or updating file_path), set `review_status='pending'` and clear `revision_notes` for that `document_type`. Trigger from Task 1 covers the file_path change path; we still update explicitly so notes always clear on resubmit.
- Notify admins: insert a `driver_notifications` row (or org-scoped notification — confirm preferred channel below) addressed to the org's owner/payroll_admin role with message "Driver {name} resubmitted {step}".

## Out of scope
- No change to `profiles.onboarding_completed` semantics or to existing `Force Re-Onboarding` Danger Zone (still nukes everything).
- No new template types; works with whatever templates the org has today.
- No email notifications (in-app notification only) unless you say otherwise.

## Open question
Admin notification on resubmit — write to `driver_notifications` (in-app, what the rest of the app uses), or no notification at all and admins just see the pending review pill next time they open the driver sheet? Default in this plan: in-app `driver_notifications` row to the org owner.
