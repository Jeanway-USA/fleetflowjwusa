
Goal: fix text-entry clipping site-wide, not just in a few pages.

What I found
- The remaining issue is primarily in entry fields with leading icons/prefixes, especially on `/load-optimizer`.
- The current shared `Input` still uses a generic padding setup, while icon/prefix fields are manually patched with `pl-10` or `pl-8`.
- That spacing is still too tight in places, especially with `type="number"` fields, placeholders, and the current input height/text sizing.
- The same fragile pattern still exists in:
  - `src/pages/LoadOptimizer.tsx`
  - `src/pages/CRM.tsx`
  - `src/components/crm/BrokerDatabase.tsx`
  - `src/components/maintenance/PMScheduleFilters.tsx`
  - `src/components/maintenance/ServiceHistoryTab.tsx`
  - `src/components/maintenance/NewWorkOrderSheet.tsx`
  - `src/components/maintenance/CompleteJobModal.tsx`
- There are also shared entry primitives that should be hardened at the source:
  - `src/components/ui/input.tsx`
  - `src/components/ui/textarea.tsx`
  - `src/components/ui/select.tsx`
  - `src/components/ui/command.tsx`

Implementation plan
1. Strengthen shared text-entry primitives
- Update `Input` so text/placeholder alignment is more resilient across text, number, email, password, and date fields.
- Add a reusable spacing convention for fields with a leading icon/prefix and one for trailing actions.
- Tighten `Textarea`, `SelectTrigger`, and `CommandInput` so they use the same vertical rhythm and don’t clip text on mobile or dense layouts.

2. Replace one-off padding hacks with a standard pattern
- Stop relying on scattered `pl-8` / `pl-10` values as the final fix.
- Use a consistent “leading adornment” pattern for icon/prefix fields and apply it everywhere that currently uses absolute-positioned icons or `$` prefixes.

3. Fix all currently identified prefixed fields
- Load Optimizer: all 4 numeric fields.
- CRM + Broker search fields.
- PM schedule and service history search fields.
- Maintenance currency inputs in work-order creation/edit/complete flows.

4. Do a broader site-wide input sweep
- Review password fields, search fields, selects, command inputs, and textareas for the same clipping risk.
- Catch form controls that may not use left icons but still inherit cramped text/placeholder behavior from the shared primitives.

5. Verify comprehensively
- Re-check representative pages with many forms and mixed field types:
  - Auth / Reset Password
  - CRM
  - Load Optimizer
  - Maintenance forms
  - Finance/shared expense forms
- Verify desktop and mobile breakpoints, with long placeholders and entered values.

Technical approach
- Standardize entry-field layout around:
  - safer internal padding
  - explicit leading/trailing adornment spacing
  - centered text line-height
  - non-interactive decorative icons/prefixes
  - overflow-safe text rendering in shared controls
- Likely outcome:
  - shared `Input` gets more robust defaults
  - shared `Textarea`, `SelectTrigger`, and `CommandInput` are aligned to the same sizing model
  - affected feature files are updated to use the standardized spacing classes instead of ad hoc padding

Files likely to update
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/command.tsx`
- `src/pages/LoadOptimizer.tsx`
- `src/pages/CRM.tsx`
- `src/components/crm/BrokerDatabase.tsx`
- `src/components/maintenance/PMScheduleFilters.tsx`
- `src/components/maintenance/ServiceHistoryTab.tsx`
- `src/components/maintenance/NewWorkOrderSheet.tsx`
- `src/components/maintenance/CompleteJobModal.tsx`
- likely a few additional auth/finance/shared form files found during the full sweep

Expected result
- No overlap between icons/prefixes and placeholder or entered text
- Consistent text-entry rendering across the whole app
- A real global fix in shared form primitives, instead of isolated page-by-page patches
