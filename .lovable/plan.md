# Inline Fill-in-the-Blank Template Inputs

The actual parser lives in `src/components/onboarding/DocumentTemplateRenderer.tsx` (used by `DriverOnboarding.tsx`). The line-break bug comes from two things:

1. Editable tokens (`cdl_number`, `driver_address`, `ssn`, `email`, `bank_*`, `routing_number`, `account_number`) wrap `<Input>` / `<Select>` in a `<span class="inline-block ...">`, but the `Input` itself is a block-level `<input>` with `h-12 sm:h-10`, full borders, and `rounded-md`. Combined with `MARKDOWN_COMPONENTS.p` re-wrapping every text chunk in a `<p>`, each input visually breaks the paragraph and forces a new line.
2. Read-only tokens (`today_date`, `company_address`, `pay_rate`, etc.) are already inline `<span>`s and just need to stay as subtle bold inline text — no change needed beyond confirming styling.

## Scope

Single file: `src/components/onboarding/DocumentTemplateRenderer.tsx`.
No changes to `Input`/`Select` primitives, no DB or hook changes, no other components.

## Changes

### 1. New shared fill-in className

Define one constant at module top:

```ts
const FILL_IN_INPUT_CLASS =
  "inline-block h-7 sm:h-7 align-baseline w-auto min-w-0 " +
  "px-1 py-0 rounded-none border-0 border-b-2 border-blue-600 " +
  "bg-blue-50/60 dark:bg-blue-950/30 " +
  "text-base sm:text-sm font-medium text-foreground " +
  "focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "focus-visible:border-blue-700 focus-visible:bg-blue-50 " +
  "placeholder:text-muted-foreground/60 placeholder:font-normal";
```

Notes:
- `h-7` overrides the default `h-12 sm:h-10` so the input matches surrounding line-height.
- `rounded-none border-0 border-b-2 border-blue-600` removes the bulky box and gives the "fillable line" look.
- `bg-blue-50/60` gives the soft tint (light blue picks up the theme; works in both modes).
- Tailwind class merging via `cn` inside `Input` means passing this through `className` cleanly overrides defaults (`h-12`, `pl-4`, `border`, `rounded-md`).

### 2. Replace each editable token's wrapper + Input

For every editable case (`cdl_number`, `driver_address`, `ssn`, `email`, `bank_name`, `routing_number`, `account_number`), change:

```tsx
<span className="inline-block align-middle mx-1 min-w-[200px] max-w-full">
  <Input ... className="h-9 inline-block" />
</span>
```

to:

```tsx
<Input
  ...
  className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[18ch]")}  // width tuned per field
/>
```

Per-token widths (using `ch` so they auto-size to text):
- `cdl_number` — `w-[16ch]`
- `driver_address` — `w-[28ch]`
- `ssn` — `w-[12ch]`
- `email` — `w-[22ch]`
- `bank_name` — `w-[20ch]`
- `routing_number` — `w-[11ch]`
- `account_number` — `w-[16ch]`

Drop the outer `<span class="inline-block ...">` entirely — the input itself is now inline-block and sits on the text baseline.

### 3. `bank_account_type` Select

Apply the same look to `SelectTrigger` via className override:

```tsx
<SelectTrigger
  className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[14ch] inline-flex")}
  aria-label="Bank account type"
>
  <SelectValue placeholder="Account type" />
</SelectTrigger>
```

Drop its outer wrapper span as well.

### 4. Read-only tokens

Audit the existing `<span className="font-medium">` renderings for `today_date`, `company_address`, `driver_name`, `contractor_state`, `license_number`, `license_expiry`, `dot_medical_expiry`, `endorsements_list`, `twic_status`, `phone_number`, `pay_type`, `pay_rate`. They are already inline + slightly bold — leave as is. Keep the destructive `[TERMS NOT SET...]` and italic `[Not provided]` fallbacks unchanged.

### 5. Paragraph wrapping fix

`MARKDOWN_COMPONENTS.p` currently has `whitespace-pre-wrap` which is fine, but token nodes are rendered as siblings to ReactMarkdown blocks — that's already inline at the React level. The real wrap-cause is the input's block sizing, which step 2 fixes. No structural change to `nodes.map` needed.

### 6. Import `cn`

Add `import { cn } from '@/lib/utils';` at the top of the file.

## Files

- **Edited**: `src/components/onboarding/DocumentTemplateRenderer.tsx`

## Verification

After build, open Driver Onboarding → a document with `{{driver_address}}`, `{{ssn}}`, `{{bank_account_type}}` tokens. Confirm:
- Inputs sit inline within the sentence, no forced line break.
- Underline-only style with soft blue tint visible.
- Read-only tokens like `{{company_address}}` render as bold inline prose.
- Both light and dark themes look correct.
