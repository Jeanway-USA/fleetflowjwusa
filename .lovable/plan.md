Fix the Pay Type Select in `src/pages/Drivers.tsx` so its values match the DB `drivers_pay_type_check` constraint (`percentage`, `per_mile`, `flat`).

- Change `<SelectItem value="cpm">` → `value="per_mile"` (keep label "CPM (Cents per Mile)")
- Remove `<SelectItem value="hourly">` (not allowed by constraint)
- Leave `flat` and `percentage` unchanged

Frontend-only fix. No DB migration.