## Goal
Make the "State withholding account ID" field conditional based on the selected filing state, and fix the input rendering.

## Background
Several states (TX, FL, NV, SD, WA, WY, AK, TN, NH) don't levy state income tax, so employers don't have a state withholding account. Currently the Tax Setup form always requires this field, blocking Texas-based orgs.

## Changes (frontend only — `src/components/payroll/setup/sections/TaxSetupSection.tsx`)

1. **Add no-SIT state list** — constant `NO_SIT_STATES = ['AK','FL','NH','NV','SD','TN','TX','WA','WY']` (NH/TN tax only investment income — treat as no wage withholding for payroll purposes).

2. **Make schema conditional** — replace the static `stateAccountId` rule with a `z.object(...).superRefine(...)` that only requires `stateAccountId` (min 4) when `filingState` is NOT in `NO_SIT_STATES`. When it is, allow empty/optional.

3. **Conditionally render the field** — watch `filingState` via `form.watch`; hide the "State withholding account ID" FormField when the selected state has no SIT. Show a small helper line in its place: "{State} has no state income tax — no withholding account required."

4. **Fix the input** — the field currently shows only a placeholder because `field.value` can be `undefined` on hydrate. Ensure the Input receives `value={field.value ?? ''}` so it renders as a controlled input consistently (apply same fix to `suiAccountId` for safety).

5. **Clear stale value on state change** — when `filingState` switches to a no-SIT state, reset `stateAccountId` to `''` so a previously typed value isn't silently submitted.

6. **Submit payload** — only include `stateAccountId` in the (future) state-tax call when the state requires it. For now the TODO comment stays; just guard the value.

## Out of scope
- No backend/edge function changes.
- SUI (unemployment) remains required for all states — every state has SUTA.
- No schema/migration changes.
