# Wire Step 1 credentials into the document template parser

## Note on file targeting

The parser doesn't actually live in `src/pages/Onboarding.tsx` (that's the org-owner wizard). The dynamic template parser is split across two files and is invoked from `DriverOnboarding.tsx` (the file where Step 1 credentials were just added). I'll update the real parser locations, plus the admin reference guide:

- `src/components/onboarding/DocumentTemplateRenderer.tsx` — on-screen renderer for the driver-facing wizard.
- `src/lib/onboarding/generateSignedPdf.ts` — final PDF generator.
- `src/pages/DriverOnboarding.tsx` — pass the new credential values down.
- `src/components/settings/DocumentTemplatesPanel.tsx` — the `VARIABLES` array that powers the admin reference guide rendered by `src/pages/admin/DocumentTemplates.tsx`.

## New tokens

| Token | Source (drivers row) | Rendered as |
|---|---|---|
| `{{license_number}}` | `license_number` | plain text, italic placeholder if blank |
| `{{license_expiry}}` | `license_expiry` (date) | formatted `MMMM d, yyyy` |
| `{{dot_medical_expiry}}` | `medical_card_expiry` | formatted `MMMM d, yyyy` |
| `{{endorsements_list}}` | `endorsements` (string[]) | comma-joined (e.g. `H, P, X`), or `None` if empty |
| `{{twic_status}}` | `has_twic` + `twic_expiry` | `Yes — expires Mar 5, 2027` when has_twic; `No` otherwise |

All five render as plain inline text in the renderer (`<span className="font-medium">…</span>`) — no inputs, since Step 1 already captured them. Dates parsed via the project convention `new Date(value + 'T00:00:00')` to avoid TZ drift.

## Changes per file

### 1. `DocumentTemplatesPanel.tsx`

Append 5 entries to the `VARIABLES` array, matching the existing format/wording:

```ts
{ token: '{{license_number}}', description: "Auto-fills the driver's CDL number captured in onboarding Step 1." },
{ token: '{{license_expiry}}', description: "Auto-fills the driver's CDL expiry date (Step 1)." },
{ token: '{{dot_medical_expiry}}', description: "Auto-fills the driver's DOT medical card expiry date (Step 1)." },
{ token: '{{endorsements_list}}', description: "Auto-fills the driver's CDL endorsements (comma-separated, e.g. H, P, X). Shows 'None' when blank." },
{ token: '{{twic_status}}', description: "Auto-fills TWIC status: 'Yes — expires <date>' or 'No' (Step 1)." },
```

### 2. `DocumentTemplateRenderer.tsx`

- Extend `TOKEN_REGEX` to include `license_number|license_expiry|dot_medical_expiry|endorsements_list|twic_status`.
- Extend `DocumentTemplateRendererProps` with optional fields:
  ```ts
  licenseNumber?: string | null;
  licenseExpiry?: string | null;        // 'yyyy-MM-dd'
  medicalCardExpiry?: string | null;    // 'yyyy-MM-dd'
  endorsements?: string[] | null;
  hasTwic?: boolean | null;
  twicExpiry?: string | null;           // 'yyyy-MM-dd'
  ```
- Add a small `formatDateToken(value)` helper using the `T00:00:00` rule, returning `'—'` (or italic `[Not provided]`) when missing.
- Add five new `case` branches in the switch — all render `<span className="font-medium">…</span>`, no inputs.

### 3. `generateSignedPdf.ts`

- Extend its `TOKEN_REGEX` with the same five token names.
- Extend `GenerateSignedPdfArgs` with the same six optional fields.
- Add matching `case` branches that append to the `buffer` as plain text (using the same formatter), falling back to `________________________` when missing — mirrors the existing fallback for empty driver-filled tokens.

### 4. `DriverOnboarding.tsx`

The Step 1 query already selects `license_number, license_expiry, medical_card_expiry, endorsements, has_twic, twic_expiry`. Pipe those fields from `driverRow` into:

- `<DocumentTemplateRenderer …>` — pass the six new props.
- `generateSignedPdf({ …, licenseNumber, licenseExpiry, medicalCardExpiry, endorsements, hasTwic, twicExpiry })` inside `finalizeSubmission`.

Because credentials are saved on Continue from Step 1 (and `refetchDriver()` runs right after), the values are guaranteed to be present in `driverRow` by the time any template step renders.

## Out of scope

- No DB changes, no migration — all source fields already exist on `drivers`.
- No new Step-1 inputs; this is purely making already-collected data flowable into templates.
- No changes to `src/pages/Onboarding.tsx` (org-owner wizard), to `pages/admin/DocumentTemplates.tsx` (it just hosts the panel), or to existing tokens.
