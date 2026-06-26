## Goal
Make the settlement PDF compiler render two distinct branded layouts based on the driver's `employment_type`:
- `w2_company` → "W-2 EARNINGS STATEMENT" paystub wrapper with statutory tax metadata block.
- `1099_contractor` / `lease_purchase` → "CONTRACTOR SETTLEMENT STATEMENT" wrapper with a detachable check voucher at the base.

Both variants share a new top-edge monospaced legacy system line.

## Scope (frontend/presentation only)
Files touched:
- `src/lib/settlement-document-data.ts` — extend `SettlementDocDriver` to fetch `employment_type` from `drivers`.
- `src/components/finance/driver-settlements/SettlementPrintable.tsx` — branch layout and inject new chrome.
- (Reuse existing `SettlementCheckVoucher.tsx` only if it already matches the spec; otherwise the voucher will be re-implemented inline in `SettlementPrintable` per the exact spec below. The existing `includeVoucher` prop becomes derived automatically from `employment_type` rather than a manual flag.)

No DB changes, no PDF engine changes (`generateSettlementPdf.ts` already renders the printable React tree). No business-logic/math changes.

## Layout spec

### 1. Top metadata row (both variants)
Absolute top edge of canvas, above the dark header banner:
```
CO: JW    FILE: {driver_id}    DEPT: DISPATCH    CLOCK: {driver_id}    NUMBER: 00000000
```
Classes: `font-mono text-[10px] text-zinc-400 tracking-wider px-10 py-1 border-b border-zinc-100`.

### 2. W-2 wrapper (`employment_type === 'w2_company'`)
- Header title swapped to **"W-2 EARNINGS STATEMENT"** (replaces the current "Settlement & Earnings Statement" eyebrow + corporate H1 styling stays).
- New **Tax & Withholding** metadata block rendered directly below the header, before "Statement Details":
  - Bordered box, 4-column grid: Filing Status, Federal Allowances, State Allowances, State Code.
  - Followed by a statutory withholding sub-grid: Federal Income Tax, Social Security (6.2%), Medicare (1.45%), State Tax — each with current period + YTD columns.
  - Values pulled from `settlement.tax_withholding` where available; allowances/filing status shown as placeholder dashes when the drivers table has no field for them (display-only — no schema change this turn).
- Voucher is NOT rendered.

### 3. 1099 / Lease wrapper (`employment_type` in `['1099_contractor','lease_purchase']`)
- Header title swapped to **"CONTRACTOR SETTLEMENT STATEMENT"**.
- Existing body (loads, dual-column itemization, summary cards) unchanged.
- Existing legal disclaimer footer unchanged.
- **Below the legal disclaimer**, append a detachable-style check voucher block:
  - Wrapper: `border-2 border-dashed border-zinc-300 bg-zinc-50/40 p-4 mt-6 relative overflow-hidden print:break-inside-avoid`.
  - Diagonal watermark: absolutely-positioned `<span>` with `rotate(-20deg)`, `text-zinc-300/40`, `text-3xl font-bold tracking-widest pointer-events-none select-none` reading `NON-NEGOTIABLE — FOR RECORD PURPOSES ONLY`.
  - 4-column grid (`grid-cols-2 md:grid-cols-4 gap-4 relative z-10`):
    1. **BANK DEPOSIT ROUTING** — masked routing/account from driver record (or `—`).
    2. **VOUCHER NUMBER** — `V-{statementNo}`.
    3. **NET DISTRIBUTION** — formatted `currentNet`.
    4. **AUTHORIZED SIGNATURE** — empty underline (`border-b border-zinc-400 h-8`) with caption.
  - Each column: `text-[10px] uppercase tracking-wider text-zinc-500` label + value below.

### 4. Fallback
If `employment_type` is `null`/unknown → default to the contractor wrapper (matches current behavior and tenant default for this TMS).

## Out of scope
- Math, totals, recalc RPCs.
- New DB columns for filing status / allowances / routing numbers (W-2 metadata is rendered with dashes when source data isn't present).
- Print/PDF generator engine changes — `generateSettlementPdf` already snapshots whatever `SettlementPrintable` renders.

## Verification
- `tsgo` typecheck.
- Render `/settlement/print/:id` for one W-2 driver and one lease driver via Playwright screenshot to confirm both variants paint correctly (header title, top monospace line, voucher presence/absence).
