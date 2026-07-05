## Bank Details & Tax Setup Forms + Unified "Required" Styling

### 1. `BankDetailsSection.tsx` — Bank form (RHF + zod)

Fields (all required for payroll compliance):
- **Account holder name** — text, 1–100 chars
- **Account type** — Shadcn `Select`: Checking / Savings
- **Routing number** — text, exactly 9 digits, `inputMode="numeric"`, ABA checksum validation (mod-10 with weights 3,7,1) in the zod refine
- **Account number** — text, 4–17 digits, masked (`type="password"` with show/hide eye toggle, same pattern as SSN field)
- **Confirm account number** — text, must equal `accountNumber` (zod `.refine` at the object level)

Layout: `PayrollSetupSectionCard` with `Landmark` icon. Two-column grid on `sm+`. Submit button "Save bank details" (full-width on mobile, right-aligned on `sm+`). `onSubmit` logs (masked) + `toast.success('Bank details saved', { description: 'Gusto API wiring pending.' })`. TODO comment for `POST /v1/companies/{id}/bank_accounts`.

### 2. `TaxSetupSection.tsx` — Tax IDs form (RHF + zod)

Fields:
- **Federal EIN** *(required)* — text, formatted `XX-XXXXXXX`, regex `^\d{2}-\d{7}$`, auto-format on input (same helper pattern as SSN)
- **Filing state** — Shadcn `Select` of `US_STATES` (required, primary state where the company will file)
- **State employer account / withholding ID** — text, 4–20 chars (required; label notes format varies by state)
- **State unemployment (SUI) account number** — text, 4–20 chars (required)
- **SUI rate (%)** — number input, 0–20, step 0.001 (required)

Layout: same shell (`Percent` icon), 2-col grid on `sm+`, EIN + Filing state in the top row, then the two state-ID fields, then SUI rate. Submit "Save tax setup" with the same log + toast stub. TODO comment for Gusto `federal_tax_details` + `state_taxes` PUT endpoints.

### 3. Unified "required" styling across all four section forms

Add a tiny shared helper `src/components/payroll/setup/RequiredLabel.tsx`:
```tsx
export function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span aria-label="required" className="text-destructive">*</span>
    </span>
  );
}
```

Apply it inside every `<FormLabel>` for required fields in all four sections (Signatory, Company & Industry, Bank Details, Tax Setup). Optional fields (Address line 2) keep their existing "(optional)" hint and no asterisk.

Also add a small legend line under each form's submit row:
`<p className="text-xs text-muted-foreground"><span className="text-destructive">*</span> Required for payroll compliance</p>`

All forms already use shadcn `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Select`, `Button` — no primitive swaps needed beyond adding the asterisk helper and legend.

### Files touched

- `src/components/payroll/setup/sections/BankDetailsSection.tsx` (rewrite body)
- `src/components/payroll/setup/sections/TaxSetupSection.tsx` (rewrite body)
- `src/components/payroll/setup/sections/SignatorySection.tsx` (add `RequiredLabel` + legend)
- `src/components/payroll/setup/sections/CompanyIndustrySection.tsx` (add `RequiredLabel` + legend)
- `src/components/payroll/setup/RequiredLabel.tsx` (new, tiny)

No routes, no API calls, no DB writes this turn.
