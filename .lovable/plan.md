## Objective
Add a "Global Invite Preferences" section in the Settings → Onboarding & Documents tab with role-based default toggles, and wire those defaults into the Team invite flow so the new `requires_onboarding` checkbox auto-flips based on the selected role.

## 1. Storage (no new table required)
Reuse the existing `public.company_settings` table (key/value, scoped by `org_id`, already has RLS and a `(org_id, setting_key)` unique constraint). Two new setting keys:

- `require_onboarding_driver` (default `"true"`)
- `require_onboarding_dispatcher` (default `"false"`)

Stored as text (`"true"` / `"false"`) to match the table's existing schema. No migration needed.

(Adding a new dedicated `organization_settings` table would duplicate `company_settings`; the user explicitly allowed "or similar global state".)

## 2. New component: `OnboardingPreferencesCard`
File: `src/components/settings/OnboardingPreferencesCard.tsx`

- TanStack `useQuery` for `company_settings` filtered by the two keys + `org_id`.
- Two `Switch` rows inside a `Card`:
  - **Require onboarding for new Drivers by default** — bound to `require_onboarding_driver`.
  - **Require onboarding for new Dispatchers by default** — bound to `require_onboarding_dispatcher`.
- `useMutation` upserts on toggle change using `onConflict: 'org_id,setting_key'`, with optimistic invalidation and `toast`.
- Disabled (read-only) when `isDemoMode`.
- Pure semantic Tailwind tokens.

## 3. Settings page update
File: `src/pages/Settings.tsx`

Inside `<TabsContent value="onboarding">`, render `<OnboardingPreferencesCard />` above the existing descriptive "no document templates yet" placeholder.

## 4. Invite User modal wiring
File: `src/components/settings/TeamManagementTab.tsx`

- Add a TanStack query `invite-onboarding-defaults` that loads the two `company_settings` rows for the current `orgId` once (5m staleTime). Returns `{ driver: boolean, dispatcher: boolean }`, defaulting to `{ driver: true, dispatcher: false }` when rows are missing.
- New local state: `inviteRequiresOnboarding: boolean`.
- When the Sheet opens OR when `inviteRole` changes, recompute the default:
  - `driver` → use `defaults.driver`
  - `dispatcher` → use `defaults.dispatcher`
  - any other role → `false` (and disable the checkbox)
- Render a shadcn `Checkbox` + label "Require onboarding before activation" inside the invite form, below the Role select. Helper text: "Defaults to your organization's preferences for this role. You can override for this invite."
- Pass `requires_onboarding: inviteRequiresOnboarding` in the `invite-user` function body alongside `email` and `role`.

## 5. Edge function (light touch)
File: `supabase/functions/invite-user/index.ts`

- Accept optional `requires_onboarding: boolean` in the request body (validated as boolean, defaults to the role-specific server-side fallback if absent).
- For now the value is forwarded but not persisted to any column (no schema change here — drivers/profiles already drive onboarding via signed-docs presence). Future scope can wire this to a `requires_onboarding` column once needed.
- This keeps the contract ready without expanding scope into schema migrations.

## 6. Verification
- Open Settings → Onboarding & Documents → toggle both switches → reload → values persist.
- Open Team → Invite Member → select Driver → checkbox reflects driver default; switch to Dispatcher → checkbox flips to dispatcher default; switch to Safety → checkbox is `false` and disabled.

## Files touched
- `src/pages/Settings.tsx`
- `src/components/settings/OnboardingPreferencesCard.tsx` (new)
- `src/components/settings/TeamManagementTab.tsx`
- `supabase/functions/invite-user/index.ts`

## Out of scope
- No new database table or columns.
- No enforcement logic for `requires_onboarding` beyond the existing signed-docs onboarding check.
- No changes to per-driver onboarding screens.