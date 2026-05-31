# Fix Direct Deposit Template Tokens

## Problem
The tokens `{{ssn}}`, `{{email}}`, `{{bank_account_type}}`, `{{bank_name}}`, `{{routing_number}}`, `{{account_number}}` render as plain text because `DocumentTemplateRenderer.tsx` (and `generateSignedPdf.ts`) only recognize a fixed allowlist of token names in their `TOKEN_REGEX`. Any token not in that list falls through to the default branch and is shown literally.

## Fix

### 1. `src/components/onboarding/DocumentTemplateRenderer.tsx`
- Extend `TOKEN_REGEX` to include the 6 new tokens.
- Extend `DocumentTemplateRendererProps` with controlled values + change handlers:
  - `ssn`, `email`, `bankName`, `routingNumber`, `accountNumber` (string + onChange)
  - `bankAccountType` ('checking' | 'savings' + onChange) — rendered with a `Select` (Checking / Savings)
- Add render cases for each new token using `Input` (and `Select` for account type), styled consistently with existing inline-input tokens (`min-w-[...] inline-block align-middle mx-1`, `h-9`). Use `type="password"` / `inputMode="numeric"` where appropriate (SSN, routing, account).

### 2. `src/pages/DriverOnboarding.tsx`
- Add local state for the 6 fields.
- Pass values + setters into `DocumentTemplateRenderer`.
- Include them in the submission payload for the Direct Deposit document (saved alongside the signed PDF / form record the way existing document submissions are stored).
- Require the bank fields before allowing submit on the Direct Deposit step (mirror existing validation pattern for signature/address).

### 3. `src/lib/onboarding/generateSignedPdf.ts`
- Extend `TOKEN_REGEX` and `GenerateSignedPdfArgs` with the same 6 fields.
- In the token switch, write the captured values into the PDF text buffer. Mask SSN as `***-**-####` and account number as `****####` in the PDF for safety; routing/bank name/email/account type print as entered.
- Pass these values through from `DriverOnboarding.tsx` when generating the signed Direct Deposit PDF.

## Out of scope
- No DB schema changes — direct deposit values are stored in the existing document submission record (JSON metadata field) the same way other dynamic form data is stored. If you'd rather persist them to a dedicated `driver_banking` table instead, say so and I'll add a migration.
- No changes to the Driver Agreement flow or pagination logic.

## Open question
Do you want the captured banking info stored as part of the signed-document submission metadata (current plan), or written to a dedicated, encrypted `driver_banking` table with strict RLS? The second is more secure for SSN/account numbers but requires a migration.
