## Add "Include Check Voucher Summary" toggle to Settlement print view

Append an optional, tear-off style check voucher block to the bottom of the settlement document. The voucher is purely presentational (record-only, non-negotiable) — no schema or financial-logic changes.

### 1. New component: `SettlementCheckVoucher.tsx`
Location: `src/components/finance/driver-settlements/SettlementCheckVoucher.tsx`

Props: `{ data: SettlementDocumentData }`

Layout:
- Outer wrapper: `mt-6 relative border-dashed border-2 border-zinc-300 rounded-md p-6 bg-white print:break-inside-avoid`
- Top tear-line label: small uppercase "Detach Here — Non-Negotiable Voucher" with scissors icon, centered above border
- Diagonal watermark overlay: absolutely-positioned `<div>` with `rotate-[-18deg]`, `text-zinc-200/60`, large bold tracking-widest text **"NON-NEGOTIABLE – FOR RECORD PURPOSES ONLY"**, `pointer-events-none select-none`, centered with flex
- Header row: "JEANWAY LLC" left / "VOUCHER" + check number right
- Grid (`grid-cols-1 md:grid-cols-2 gap-4`) of fields:
  - **Pay To The Order Of**: driver full name
  - **Amount**: net pay (numeric + written-out English amount, e.g. "Two Thousand Four Hundred and 00/100 — USD")
  - **Pay Date**: settlement payment_date
  - **Check Number**: `VCH-{statementNo}` (derived, not stored)
  - **Bank / Routing**: placeholder line `XXXX-XXXX-XXXX` + "ACH Direct Deposit on File"
  - **Memo**: `Settlement {period_start} – {period_end}`
- Signature row at bottom:
  - Left: "Authorized Signature" with cursive font (`font-[cursive]` / Tailwind `italic` + Google "Great Vibes" via inline style fallback) rendering "Jean-Way Payroll" above a thin `border-t border-zinc-800` line
  - Right: small "Date" with payment_date above a signature line

### 2. Toggle UI on `SettlementPrint.tsx`
- Add local state `const [includeVoucher, setIncludeVoucher] = useState(false)`
- In the top action bar (next to Print/Download buttons), add a `<Switch>` + `<Label>` block (shadcn): **"Include Check Voucher Summary"**, hidden via `print:hidden`
- Pass `includeVoucher` to `<SettlementPrintable data={data} includeVoucher={includeVoucher} />`

### 3. Wire into `SettlementPrintable.tsx`
- Accept new optional prop `includeVoucher?: boolean`
- Render `{includeVoucher && <SettlementCheckVoucher data={data} />}` **after** the legal footer block so it sits at the absolute bottom of the page
- Keep `print:break-inside-avoid` so the voucher never splits across pages

### 4. PDF export sync (`generateSettlementPdf.ts`)
- Accept second arg `{ includeVoucher?: boolean }`
- When true, after the existing footer, draw:
  - Dashed rectangle (`doc.setLineDash([3,3])`) sized to remaining bottom margin
  - Faint diagonal watermark text using `doc.saveGraphicsState()` + `setGState({opacity:0.12})` + 35° rotation
  - 2-column field grid via `autoTable` with `theme:'plain'`
  - Signature line + cursive "Jean-Way Payroll" using an italic font fallback
- Update `handleDownload` in `SettlementPrint.tsx` to pass `{ includeVoucher }`

### 5. Helpers
- Add small util `numberToEnglishUsd(amount: number): string` in `src/lib/formatters.ts` (or co-located in the voucher component) for the written amount line

### Scope guardrails
- No database, RLS, or settlement-totals changes
- No new dependencies (use existing Switch, Label, jsPDF, autoTable)
- Voucher is record-only; explicit non-negotiable watermark on both web and PDF

### File touch list
- **new** `src/components/finance/driver-settlements/SettlementCheckVoucher.tsx`
- **edit** `src/components/finance/driver-settlements/SettlementPrintable.tsx` (prop + render)
- **edit** `src/pages/SettlementPrint.tsx` (Switch + state, pass flag to PDF)
- **edit** `src/lib/pdf/generateSettlementPdf.ts` (optional voucher block)
- **edit** `src/lib/formatters.ts` (number-to-words helper)
