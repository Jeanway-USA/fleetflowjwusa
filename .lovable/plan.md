## Plan: `useSafetyBonus(driverId)` hook

Create `src/hooks/useSafetyBonus.ts` — a TanStack Query hook that computes a driver's live Safety & Performance Bonus standing for the current period.

### Data sources

- `safety_bonus_settings` — one row per org (max amount, period length, three "requires zero" toggles).
- `safety_bonus_tiers` — mileage tiers (min_miles, max_miles nullable, rate_per_mile).
- `drivers` — to resolve `org_id` from the passed `driverId`.
- `fleet_loads` — completed loads in the period (miles + service failures).
- `incidents` — disqualifying accidents and CSA citations in the period.

Since the schema has no dedicated `csa_points` or `service_failures` tables, we'll use these proxies (documented in the hook):
- **Accidents** → `incidents` rows where `incident_type = 'accident'` and `severity != 'minor'`.
- **CSA points** → `incidents` rows where `citation_issued = true`.
- **Service failures** → `fleet_loads` in the period with `status = 'late'` OR `delivery_date < actual delivery` (we'll simply use a `status in ('late','service_failure')` check; easy to refine later).

### Query shape

Single `useQuery` keyed `['safety-bonus', driverId]`, enabled when `driverId` is set. Internally:

1. Load driver to get `org_id`.
2. Load `safety_bonus_settings` for that org. If missing → return `{ isEligible: false, currentSafeMiles: 0, currentEarnedBonus: 0, currentRate: 0, nextTierMiles: null, maxBonus: 0 }`.
3. Compute `periodStart = today - period_length_days` (UTC date, formatted `YYYY-MM-DD`; honors the project's date-handling rule).
4. In parallel:
   - `safety_bonus_tiers` where `setting_id = settings.id`, ordered by `min_miles asc`.
   - `fleet_loads` for the driver where `status = 'delivered'` and `delivery_date >= periodStart` — sum `actual_miles ?? booked_miles ?? 0` → `currentSafeMiles`.
   - If `requires_zero_accidents` or `requires_zero_csa_points`: `incidents` for driver in period.
   - If `requires_zero_service_failures`: count `fleet_loads` with failure status in period.
5. Derive `isEligible` by AND-ing the three toggles against their respective checks (a toggle that's off is auto-pass).

### Tier math

```ts
const sortedTiers = tiers.sort((a,b) => a.min_miles - b.min_miles);
const currentTier = sortedTiers.findLast(t =>
  currentSafeMiles >= t.min_miles &&
  (t.max_miles == null || currentSafeMiles < t.max_miles)
);
const currentRate = currentTier?.rate_per_mile ?? 0;

const nextTier = sortedTiers.find(t => t.min_miles > currentSafeMiles);
const nextTierMiles = nextTier ? nextTier.min_miles - currentSafeMiles : null;

const rawBonus = isEligible ? currentSafeMiles * currentRate : 0;
const currentEarnedBonus = Math.min(rawBonus, settings.max_bonus_amount);
```

### Return type

```ts
type SafetyBonusStatus = {
  isEligible: boolean;
  currentSafeMiles: number;
  currentEarnedBonus: number;   // capped at maxBonus
  currentRate: number;          // $/mile at current tier
  nextTierMiles: number | null; // null if at top tier
  maxBonus: number;
  periodStart: string;          // YYYY-MM-DD, for UI display
  periodEnd: string;
  isLoading: boolean;
  // disqualifiers, for UI hints
  disqualifiers: { accidents: boolean; csaPoints: boolean; serviceFailures: boolean };
};
```

Hook returns `{ data, isLoading, error, ...status }` shape — spreading defaults during load so consumers can render zero-state without null checks.

### Conventions followed

- 5-minute `staleTime`, `refetchOnWindowFocus: false` (project default).
- All date filters use `YYYY-MM-DD` strings to avoid timezone shifting.
- No business-logic side effects; pure read hook.
- No UI changes in this step.

### Open question

The schema doesn't have explicit CSA-points or service-failure tables. The plan uses `incidents.citation_issued` and `fleet_loads.status='late'` as proxies. If you have specific source columns/tables in mind for these signals, tell me and I'll swap them in before implementation.
