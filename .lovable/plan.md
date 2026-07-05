## Add Signatory & Company/Industry Forms to Payroll Setup

Note: the user references `GustoCompanySetup.tsx`, but the scaffolded files are `SignatorySection.tsx` and `CompanyIndustrySection.tsx` under `src/components/payroll/setup/sections/`. Plan targets those.

### 1. `SignatorySection.tsx` — Signatory form

Replace the placeholder body with a React Hook Form + zod form inside the existing `PayrollSetupSectionCard`.

Fields:
- **First Name** — text, required, 1–50 chars
- **Last Name** — text, required, 1–50 chars
- **Title** — text, required, 1–100 chars (e.g. "Owner", "CEO")
- **Date of Birth** — Shadcn Datepicker (Popover + Calendar with `pointer-events-auto`), required, must be a past date and age ≥ 18
- **SSN** — text, required, masked/formatted `XXX-XX-XXXX`, regex `^\d{3}-?\d{2}-?\d{4}$`, input `type="password"` (or toggleable), autoComplete off

Layout: two-column grid on `sm+`, single column on mobile. Submit button "Save Signatory" (full width on mobile, right-aligned on `sm+`). `onSubmit` currently just `console.log` + toast "Signatory saved (Gusto API wiring pending)".

### 2. `CompanyIndustrySection.tsx` — Company & Address/Industry form

Same RHF + zod pattern.

Fields:
- **Legal Company Name** — text, required, **default `"JeanWay LLC"`**
- **Street Address (line 1)** — text, required
- **Address Line 2** — text, optional
- **City** — text, required
- **State** — Shadcn `Select` of US state codes (reuse existing state list if one exists in `src/lib` / `src/constants`; otherwise inline a `US_STATES` const in the section file)
- **ZIP** — text, regex `^\d{5}(-\d{4})?$`
- **Industry** — Shadcn `Select` with a curated NAICS list relevant to trucking (General Freight Trucking, Long-Distance / Local, Specialized Freight, Courier, Warehousing, Other). Values = NAICS codes, labels = human names. Stored in a local `INDUSTRY_OPTIONS` const.

Layout: address block as 2-column responsive grid (line1 full width, city/state/zip on one row `sm+`), industry field full width below. Submit button "Save Company Info", same toast + `console.log` stub.

### 3. Shared/misc

- Both forms use `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` from `@/components/ui/form`.
- Use `useToast` from `@/hooks/use-toast` for the stub submit feedback.
- No new deps — `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`, shadcn primitives are all already in the project.
- No API calls, no edge functions, no DB writes this turn — TODO comments mark where the Gusto `/companies/{id}` and `/companies/{id}/signatories` calls will go.
- Blocker badge on `PayrollSetup.tsx` stays as `—` (unchanged).

### Files touched

- `src/components/payroll/setup/sections/SignatorySection.tsx` (rewrite body)
- `src/components/payroll/setup/sections/CompanyIndustrySection.tsx` (rewrite body)

No route, layout, or other section changes.
