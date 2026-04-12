
Goal: fix the remaining clipping the screenshot shows on text-entry fields, starting with Load Optimizer and then standardizing the pattern site-wide.

What I found
- The issue in your screenshot is not the KPI cards anymore; it is the form input fields with left-side icons/prefixes.
- In `LoadOptimizer.tsx`, the icon is absolutely positioned, but the input only uses `pl-9`, which is too tight relative to the shared `Input` padding and height.
- The same pattern appears in other places:
  - `src/pages/LoadOptimizer.tsx`
  - `src/pages/CRM.tsx`
  - `src/components/crm/BrokerDatabase.tsx`
  - `src/components/maintenance/PMScheduleFilters.tsx`
  - `src/components/maintenance/ServiceHistoryTab.tsx`
  - `src/components/maintenance/NewWorkOrderSheet.tsx`
  - `src/components/maintenance/CompleteJobModal.tsx`
- The shared `Input` component also lacks a standardized “with leading icon/prefix” variant, so multiple screens are hand-tuning `pl-7`, `pl-9`, and `pl-10`.

Implementation plan
1. Standardize prefixed input spacing in the shared input component
- Update `src/components/ui/input.tsx` so text stays vertically centered and has safer horizontal padding for mobile/desktop.
- Add a reusable class pattern for inputs that have a left icon/prefix so every prefixed field gets enough left inset consistently.

2. Fix Load Optimizer first
- Increase left padding for the 4 prefixed numeric fields.
- Make the decorative icons non-interactive and keep them vertically centered.
- Verify placeholders and typed values no longer overlap with the icon.

3. Sweep all matching prefixed inputs across the app
- Replace hard-coded `pl-7` / `pl-9` / `pl-10` usages with the same spacing pattern in:
  - CRM search
  - Broker search
  - PM schedule filters
  - Service history search
  - Maintenance cost fields in sheets/modals

4. Do a broader text-entry pass
- Review shared `Textarea` and any remaining high-risk text-entry layouts to ensure no clipping from padding/line-height mismatches.
- Only patch additional screens where the issue is caused by the same entry-field pattern, not unrelated layout bugs.

5. Verify responsiveness
- Re-check the affected entry fields on small and medium viewports, especially Load Optimizer.
- Confirm the fix does not affect search fields, numeric inputs, or modal forms.

Technical details
- Root cause: absolute-positioned leading icons with insufficient left padding on the input itself.
- Likely fix pattern:
  - icon: `pointer-events-none absolute left-3 top-1/2 -translate-y-1/2`
  - input: use a larger consistent left inset such as `pl-10 sm:pl-11`
- For dollar-prefix fields now using `pl-7`, they should be brought up to the same safe spacing standard.
- This is a frontend-only change; no backend or auth changes are needed.

Files to update
- `src/components/ui/input.tsx`
- `src/pages/LoadOptimizer.tsx`
- `src/pages/CRM.tsx`
- `src/components/crm/BrokerDatabase.tsx`
- `src/components/maintenance/PMScheduleFilters.tsx`
- `src/components/maintenance/ServiceHistoryTab.tsx`
- `src/components/maintenance/NewWorkOrderSheet.tsx`
- `src/components/maintenance/CompleteJobModal.tsx`
- Possibly `src/components/ui/textarea.tsx` if the broader pass shows the same spacing issue there

Expected outcome
- No more icon/text overlap in Load Optimizer inputs
- Consistent entry-field spacing across the rest of the app
- Fewer one-off padding hacks going forward because the pattern becomes standardized
