## Plan: Safety & Performance Bonus Settings UI

### Where it lives

Create a new component `src/components/finance/SafetyBonusSettings.tsx` and render it inside the Finance page's existing "Settings" tab, directly below `<CompensationSettingsTab />` in `src/pages/Finance.tsx`. This matches the existing pattern (CompensationSettingsTab is already the home for pay-related config) and avoids touching the unrelated `/settings` page tabs.

### Component shape

`<SafetyBonusSettings />` — self-contained, no props. Uses `useAuth()` for `org_id` and TanStack Query for fetching/saving.

#### Data fetching

Single query keyed `['safety-bonus-config', orgId]` that returns `{ settings, tiers }`:
- Loads `safety_bonus_settings` row for the org (`maybeSingle`).
- If a settings row exists, loads `safety_bonus_tiers` filtered by `setting_id`, ordered by `min_miles asc`.
- If no settings row exists yet, returns sensible defaults so the form renders a "first-time setup" state.

#### Local form state

- `globalRules`: `{ max_bonus_amount, period_length_days, requires_zero_accidents, requires_zero_csa_points, requires_zero_service_failures }`.
- `tiers`: array of `{ id?, min_miles, max_miles, rate_per_mile, _isNew?, _toDelete? }` (string inputs, parsed on save).

Hydrated from the query via `useEffect`. Dirty-state detection: simple JSON-diff against the last loaded snapshot to toggle a "Save Changes" button.

### Card UI

One `Card` titled "Safety & Performance Bonus Configuration" with `ShieldCheck` icon, broken into two sections separated by `<Separator />`:

**Global Rules**
- 3-column responsive grid:
  - "Max Bonus Amount ($)" — numeric `Input`, step `0.01`.
  - "Period Length (Days)" — numeric `Input`, step `1`, min `1`.
- Three `Switch` rows (with `Label`):
  - Zero Accidents Required
  - Zero CSA Citations Required
  - Zero Service Failures Required

**Mileage Tiers**
- Section header with subtitle ("Drivers earn the rate from the tier matching their period miles") and an "Add Tier" button (`Plus` icon).
- For each tier: a row with three inputs (`Min Miles`, `Max Miles (blank = ∞)`, `Rate Per Mile $`) plus a destructive `Trash2` icon button to mark for delete. Rows marked `_toDelete` render with `opacity-50` and a small "Will be removed" badge, with an undo button.
- Validation hints (inline `text-destructive` text, no toast spam):
  - `max_miles` (when set) must be greater than `min_miles`.
  - Tiers should not overlap — warn but don't hard-block.
- Empty state: helper text + a single "Add your first tier" button when `tiers.length === 0`.

### Save flow (single mutation)

`onSave`:
1. Validate: `max_bonus_amount >= 0`, `period_length_days >= 1`, every tier has numeric `min_miles` and `rate_per_mile`, and every set `max_miles > min_miles`. Abort with `toast.error` if invalid.
2. **Upsert settings**: if `settings.id` exists, `update` by id; else `insert` with `org_id`. Capture `setting_id` returned from insert. Use `.select().single()` to get the id back.
3. **Reconcile tiers** in parallel:
   - Delete: any tier with `id` and `_toDelete === true` → `.delete().eq('id', id)`.
   - Insert: any tier with `_isNew && !_toDelete` → `.insert({ setting_id, org_id, min_miles, max_miles, rate_per_mile })`.
   - Update: existing tier rows that changed → `.update(...).eq('id', id)`.
4. On success: `queryClient.invalidateQueries({ queryKey: ['safety-bonus-config', orgId] })`, also invalidate `['safety-bonus']` so any driver-side `useSafetyBonus` consumers refetch. Toast success.

All writes include `org_id` per the multi-tenant payload rule.

### Permissions / loading / edge

- RLS already restricts management to owners; show the card to everyone allowed to see this Finance tab (UI access is already gated by the parent route).
- Loading: render the card shell with `Skeleton` rows.
- Errors: `toast.error(error.message)`.

### Files touched

- **New**: `src/components/finance/SafetyBonusSettings.tsx`
- **Edited**: `src/pages/Finance.tsx` — add one import and render `<SafetyBonusSettings />` below `<CompensationSettingsTab getSetting={getSetting} />` inside the existing Settings `TabsContent`.

No DB migrations, no other component changes.
