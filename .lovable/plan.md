## Problem

The State Filing Deadlines card lists every state because it builds its state list from the union of (a) states where drivers are assigned and (b) every row in the org's state tax configuration table — and that table is seeded with all states, so all 50 show up.

## Fix

In `src/components/finance/inhouse-payroll/StateFilingRegistry.tsx`:

- Build the state list **only** from active (non-terminated) drivers' tax states.
- Keep using the state tax configuration rows purely as a lookup for whether each of those states has state income tax (SIT), not as a source of states.
- Empty state stays as-is: "No W-2 employees with a tax state assigned yet."

## Technical detail

Replace the `states` memo's `new Set([...driverStates, ...cfgMap.keys()])` union with `driverStates` alone, sorted, mapping each code to `hasStateIncomeTax: cfgMap.get(code) ?? false`. No database or schema changes needed.
