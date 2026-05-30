# Driver Profile & Credentials — Step 1 of Driver Onboarding

Add a new first step to `src/pages/DriverOnboarding.tsx` that collects the driver's CDL/medical/TWIC credentials and saves them to the existing `drivers` row before the document-signing steps begin.

## Scope

- File: `src/pages/DriverOnboarding.tsx` (existing driver-facing wizard).
- New file: `src/components/onboarding/DriverCredentialsStep.tsx` (the form component, kept separate to keep the wizard file readable).
- No DB migration — the `drivers` table already has every needed column (`license_number`, `license_expiry`, `medical_card_expiry`, `endorsements`, `has_twic`, `twic_expiry`).
- No changes to `src/pages/Onboarding.tsx` (owner wizard) or to document templates.

## UX flow

```
[ Step 1: Driver Profile & Credentials ]  ← NEW
        ↓ Save to drivers row
[ Step 2..N: existing document templates ]
        ↓
[ Success screen with signed PDFs ]
```

- Total step count becomes `templates.length + 1`.
- Progress bar and "Step X of Y" label include the new step.
- Back/Continue buttons follow the same pattern already in the file.
- If the driver's row already has these values populated (e.g. they return mid-flow), prefill the form from `driverRow`.

## Step 1 form contents (shadcn/ui)

Wrapped in a single `<Card>` matching the styling of the existing document step.

1. **License Number** — `<Input>` (required, 4–30 chars).
2. **License Expiry Date** — shadcn DatePicker (Popover + Calendar, `pointer-events-auto`). Required, must be ≥ today.
3. **DOT Medical Card Expiration Date** — same DatePicker. Required, must be ≥ today.
4. **Endorsements** — grid of 6 `<Checkbox>` controls inside a `<FormItem>` group, options `H, P, T, N, S, X`. Multi-select, no minimum (drivers may have none). Stored as `string[]`.
5. **TWIC Card?** — shadcn `<RadioGroup>` with two options (Yes / No). Required.
6. **TWIC Expiry Date** — DatePicker, **only rendered when** `hasTwic === 'yes'`. Required + must be ≥ today only in that branch (zod `superRefine`).

All fields use `<Form>` / `<FormField>` / `<FormControl>` / `<FormMessage>` for inline errors.

## Validation (zod schema)

```ts
const endorsementSchema = z.enum(['H','P','T','N','S','X']);
const schema = z.object({
  licenseNumber: z.string().trim().min(4).max(30),
  licenseExpiry: z.date({ required_error: 'License expiry is required' })
                  .refine(d => d >= startOfToday(), 'License must not be expired'),
  medicalCardExpiry: z.date({ required_error: 'Medical card expiry is required' })
                      .refine(d => d >= startOfToday(), 'Medical card must not be expired'),
  endorsements: z.array(endorsementSchema).default([]),
  hasTwic: z.enum(['yes','no'], { required_error: 'Please select an option' }),
  twicExpiry: z.date().optional(),
}).superRefine((val, ctx) => {
  if (val.hasTwic === 'yes') {
    if (!val.twicExpiry) ctx.addIssue({ code: 'custom', path: ['twicExpiry'], message: 'TWIC expiry is required' });
    else if (val.twicExpiry < startOfToday()) ctx.addIssue({ code: 'custom', path: ['twicExpiry'], message: 'TWIC card must not be expired' });
  }
});
```

`form.formState.isValid` (with `mode: 'onChange'`) drives the Continue button's `disabled` state, matching the existing `canContinue` pattern in the file.

## Save on Continue

When the user clicks Continue on Step 1, before advancing `stepIndex`:

```ts
await supabase
  .from('drivers')
  .update({
    license_number: values.licenseNumber,
    license_expiry: format(values.licenseExpiry, 'yyyy-MM-dd'),
    medical_card_expiry: format(values.medicalCardExpiry, 'yyyy-MM-dd'),
    endorsements: values.endorsements,
    has_twic: values.hasTwic === 'yes',
    twic_expiry: values.hasTwic === 'yes' ? format(values.twicExpiry!, 'yyyy-MM-dd') : null,
  })
  .eq('id', driverRow.id)
  .eq('org_id', orgId);
```

- Dates formatted as `yyyy-MM-dd` (no timezone shift — matches the project's date-handling rule).
- If `has_twic` flips to "no", `twic_expiry` is explicitly nulled.
- Errors surface via `toast.error` and the step does not advance.
- On success, advance to step index 1 (first document template).

## Integration with existing wizard

- `totalSteps = templates.length + 1` and `stepIndex === 0` renders the new credentials card; otherwise the existing template renderer runs with `templates[stepIndex - 1]`.
- Final-submit logic (`stepIndex === totalSteps - 1` → `finalizeSubmission`) keeps working unchanged because the offset only affects the first step.
- The "no documents to sign" empty state is preserved (we still render the credentials step even if `templates.length === 0`, then submit directly).

## Out of scope

- No changes to `Onboarding.tsx` (owner wizard).
- No new DB columns; no migration.
- No changes to document templates, signed-PDF generation, or storage.
- No changes to RLS (existing "Drivers can view their own record" + owner manage policies cover updates by the driver via service flows; we update through the driver's authenticated session which is allowed by the owner/payroll policy chain — if the update is rejected by RLS in practice we will surface a clear toast and revisit policies in a follow-up).
