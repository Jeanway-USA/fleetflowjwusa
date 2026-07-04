## Goal

Replace the "Coming soon" placeholder cards for employment-specific docs with real signature UI and form fields. Validity of every field/signature — shared + conditional — must gate the onboarding "Complete" button. No DB persistence yet (follow-up will wire storage).

## New files

### `src/components/onboarding/W2Documents.tsx`
Renders three signable forms stacked vertically:

1. **Federal W-4 Withholding**
   - Fields: Full name, SSN (9 digits), Address, Filing status (single/married/hoh via `RadioGroup`), Multiple jobs checkbox, Dependents amount (number), Other income (number, optional), Deductions (number, optional), Extra withholding (number, optional).
   - Signature pad + date (auto-today, read-only).
2. **Form I-9 Employment Eligibility**
   - Section 1 fields: Full name, Other last names (optional), Address, DOB, SSN (9 digits), Email, Phone, Citizenship status (radio: US citizen / non-citizen national / permanent resident + alien # / authorized alien + expiry & doc #).
   - Attestation checkbox ("I am aware that federal law provides for imprisonment…").
   - Signature pad + date.
3. **Direct Deposit Authorization**
   - Fields: Bank name, Account type (radio checking/savings), Routing (9 digits), Account (≥4 digits), Confirm account (must match).
   - Authorization checkbox.
   - Signature pad + date.

Props:
```ts
interface W2DocumentsProps {
  driverRow: DriverRowLike;
  value: W2DocsState;
  onChange: (patch: Partial<W2DocsState>) => void;
  onValidityChange: (valid: boolean) => void;
}
```
Exports `W2DocsState` type, `EMPTY_W2_DOCS_STATE`, and `isW2DocsValid(state)` pure helper.

### `src/components/onboarding/ContractorDocuments.tsx`
Two signable forms:

1. **W-9 Taxpayer ID**
   - Fields: Legal name, Business name (optional), Federal tax classification (radio: individual/sole prop, single-member LLC, C-corp, S-corp, partnership, LLC, other), Address, TIN type (radio SSN/EIN), TIN value (9 digits).
   - Certification checkboxes (backup withholding + accuracy).
   - Signature pad + date.
2. **Independent Owner-Operator Agreement**
   - Read-only agreement text block (static contractor terms — no {{placeholders}}, plain English scope, indemnity, insurance, termination, IC status).
   - Fields: Legal name, Business/DBA (optional), MC #, DOT #, Effective date (defaults to today).
   - Two attestation checkboxes ("I have read and agree…", "I acknowledge independent contractor status, not employee").
   - Signature pad + date.

Same prop shape as W2Documents with `ContractorDocsState`, `EMPTY_CONTRACTOR_DOCS_STATE`, `isContractorDocsValid`.

### Signature reuse
Both files reuse the existing signature pad component (`SignaturePad`/equivalent already used by `DocumentTemplateRenderer`). I'll locate it during the build and import — no new signature primitive.

## Changes to `src/components/onboarding/DocumentSignatureStep.tsx`

- Remove `W2_PLACEHOLDERS` and `CONTRACTOR_PLACEHOLDERS` (keep `SHARED_PLACEHOLDERS` — Safety Policy and Equipment Use Agreement stay as ack-checkbox cards for now).
- Add local state:
  ```ts
  const [w2Docs, setW2Docs] = useState<W2DocsState>(EMPTY_W2_DOCS_STATE);
  const [contractorDocs, setContractorDocs] = useState<ContractorDocsState>(EMPTY_CONTRACTOR_DOCS_STATE);
  const [w2Valid, setW2Valid] = useState(false);
  const [contractorValid, setContractorValid] = useState(false);
  ```
- In the W-2 branch: render `<W2Documents value={w2Docs} onChange={p => setW2Docs(s => ({...s, ...p}))} onValidityChange={setW2Valid} driverRow={driverRow} />` after any `w2Templates` (Direct Deposit template becomes redundant but stays rendered so nothing regresses).
- In the 1099 branch: render `<ContractorDocuments ... onValidityChange={setContractorValid} />`.
- Extend the aggregate validity effect:
  ```
  onValidityChange(
    templatesValid &&
    sharedPlaceholdersValid &&
    (employmentType === 'W-2' ? w2Valid : contractorValid)
  )
  ```
  where `sharedPlaceholdersValid` only checks `SHARED_PLACEHOLDERS` acks. Add `w2Valid`, `contractorValid`, `employmentType` to the effect deps.

- No changes to `DriverOnboarding.tsx` — it already reads a single boolean via `onValidityChange`, which gates the Complete button.

## Validation rules (used by both new files and mirrored in `isXValid` helpers)

Signature: must be a `data:image/...` URL.
Text field: `.trim().length > 0`.
SSN/TIN/EIN/Routing: exactly 9 digits after `\D` strip.
Account #: ≥4 digits, `accountNumber === confirmAccountNumber`.
Radios/select: non-empty string.
Numbers (W-4 amounts): allowed empty for optional fields, must parse as number ≥0 when filled.
Attestation checkboxes: all true.

## Out of scope (explicit)

- No new tables, edge functions, or storage uploads. `finalizeSubmission` unchanged.
- No changes to shared placeholder cards (Safety Policy, Equipment Use) — they remain ack-only.
- No edits to `DocumentTemplateRenderer` or existing DB templates.
- No routing/step-index changes in `DriverOnboarding.tsx`.

## Follow-up (not in this task)

Persist `w2Docs` / `contractorDocs` + signature images to storage and an `onboarding_documents` table so onboarding review can see them.
