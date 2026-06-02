## Current state

The "hardcoded UUID" is actually a **name-substring check** in two places:

- `src/components/shared/BetaFeedbackWidget.tsx:139` — `if (orgName?.toLowerCase().includes('jeanway')) return null;`
- `src/components/shared/WelcomeBetaModal.tsx:16` — `const hideDiscord = orgName?.toLowerCase().includes('jeanway') ?? false;`

Both gate the Beta Feedback widget and the Discord promotion inside the Welcome Beta modal. This breaks the moment JeanWay renames their org, and provides no path for other orgs (white-label tenants, paying customers) to opt out.

The `organizations` table has **no** `hide_promotions` field today — needs to be added.

## Plan

### 1. Migration — add the flag
Add a single boolean column on `public.organizations`:

```sql
ALTER TABLE public.organizations
  ADD COLUMN hide_promotions boolean NOT NULL DEFAULT false;
```

Then seed `hide_promotions = true` for the JeanWay org so behavior doesn't regress (one-row UPDATE via the data tool, separate step, after the migration).

No new RLS needed — `organizations` already has tenant-scoped policies, and this field is readable by the same users who read `name`/`subscription_tier`.

### 2. Expose via `AuthContext`
- Add `hidePromotions: boolean` to `AuthContextType` (default `false`).
- Select it in `fetchOrgData`'s `organizations` query alongside `name, subscription_tier, primary_color, …`.
- Add `setHidePromotions` state, reset to `false` in `resetTenantState` (already exists from the prior audit pass).
- Include `hidePromotions` in the provider's value object.

### 3. Refactor the two widgets
- `BetaFeedbackWidget.tsx`: replace `orgName?.toLowerCase().includes('jeanway')` with `hidePromotions` from `useAuth()`.
- `WelcomeBetaModal.tsx`: replace `const hideDiscord = orgName?.toLowerCase().includes('jeanway')` with `const hideDiscord = hidePromotions` from `useAuth()`.

### 4. Surface the toggle to super admins (optional, scoped tight)
Add a "Hide promotional content (Discord, beta feedback widget)" switch to the existing super-admin org-edit dialog in `SuperAdminDashboard` so other tenants can be opted out without a migration. **Skip unless requested** — minimal-scope refactor doesn't strictly need it; flag is settable via the DB tool.

### Out of scope
- Renaming the column to anything broader (e.g. `is_white_label`) — single flag is enough.
- Tier-based gating (e.g. "hide for all paid tiers") — the user explicitly said "tier, role, OR `hide_promotions` boolean"; the boolean is the most flexible and least coupled.

### Verification
1. Migration applies cleanly; `\d organizations` shows the new column with `DEFAULT false`.
2. Seed JeanWay org → log in as JeanWay user → Beta Feedback widget gone, Welcome modal shows no Discord block.
3. Log in as any other org → widget visible, Discord block visible.
4. `grep -ri "jeanway" src/components/shared/{BetaFeedbackWidget,WelcomeBetaModal}.tsx` returns no matches.