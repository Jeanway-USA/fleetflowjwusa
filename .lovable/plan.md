## Goal
Add a new alert pill to the executive dashboard's morning briefing that surfaces documents awaiting the current user's signature, matching the existing pill styling from the reference image.

## Change

**File:** `src/components/executive/MorningBriefingWidget.tsx`

1. Extend the `useQuery` to also fetch pending signatures for the logged-in user:
   - Query `document_instances` where `org_id = orgId` and `status = 'pending_signatures'`, selecting `id, signatory_roles, current_step, assigned_to_user`.
   - Query `document_signatures` filtered by `signer_id = user.id` to build a set of `${instance_id}:${step_index}` already signed (mirrors the logic in `src/pages/DocumentsSigning.tsx`).
   - Pull `user` and `roles` from `useAuth()`.
   - Count an instance as pending for the user when:
     - `assigned_to_user === user.id`, OR
     - `assigned_to_user` is null AND `signatory_roles[current_step]` is in `roles`
     - AND the `${id}:${current_step}` combo is not in the signed set.

2. If that count > 0, push a new `BriefingMetric` after the existing entries:
   - `key: 'pending-signatures'`
   - `label: 'Pending Signatures'`
   - `count: <computed>`
   - `icon: FileSignature` (import from `lucide-react`)
   - `colorClass: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'` (matches the amber/gold outline used by the "Loads Picking Up Today" pill in the reference image; the app's `--primary` token renders as that gold)
   - `action: 'navigate'`, `route: '/documents/signing'`

3. Add `user?.id` to the query key so the pill updates per user; keep the widget hidden when no metrics resolve.

## Out of Scope
- No changes to driver-facing components, edge functions, or database schema.
- No modifications to `CriticalAlertsBar` or the signing pages themselves.
- Styling reuses the existing pill classes — no new tokens or CSS.
