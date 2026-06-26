# Settlement Printable: ADP Paystub Styling Pass

Single-file styling refactor of `src/components/finance/driver-settlements/SettlementPrintable.tsx` to match an enterprise ADP-style stub. No data layer or component API changes.

## 1. Sharper grids, tighter density

Replace soft cards with explicit table-matrix grids.

- `ItemColumn`: drop `rounded-lg` → use `border border-zinc-200 rounded-none shadow-none`. Convert the inner `divide-y` div into a real `<table>` with two `<th>` columns ("Description" / "Amount") and rows that apply `py-1 px-3` + `even:bg-slate-50/50`. Negative amounts stay red.
- `ItemRow`: refactored as a `<tr>` consumed by `ItemColumn`'s table.
- `SummaryCard`: same treatment — `rounded-none`, no shadow, body becomes a `<table>` with `py-1 px-3` and zebra rows. Net Pay row keeps bold + larger type for the headline number.
- `Load Earnings & Routes` table: tighten existing `px-3 py-2` → `py-1 px-3`, keep the dark `<thead>`, retain the existing `even:bg-slate-50/50` zebra.
- `Tax & Withholding` block (W-2 only): swap `rounded-md` for `rounded-none`, keep existing `even:bg-slate-50/50` on `WithholdingRow`, tighten its padding to `py-1 px-3`.
- `Statement Details` / `Employee Information` panel: switch to `border border-zinc-200 rounded-none` and render the field list as a 2-column `<table>` matrix so labels and values line up on the same grid as the rest.

## 2. Monospace system header row

Already present at line 63 (`CO: JW … NUMBER: 00000000`). No structural change; verify class string is exactly `font-mono text-[10px] text-zinc-400 tracking-wider` and keep the thin `border-b border-zinc-100`. No code change unless the class drifted.

## 3. Compliance check voucher — make universal

The dashed-border voucher currently only renders for non-W-2 drivers. Per the spec it must sit at the **absolute bottom** of every statement.

- Move the voucher block out of the `!isW2` conditional so it renders for W-2, 1099, and Lease.
- Render it after the legal `<footer>` so it is the last element inside the document container.
- Container classes exactly as specified: `relative overflow-hidden border-2 border-dashed border-zinc-300 bg-zinc-50/40 p-4 min-h-[110px]`.

## 4. Diagonal "NON-NEGOTIABLE" watermark + voucher grid

Already implemented but refine:

- Watermark span: keep absolute positioning, set color to `text-zinc-300/40` (light opacity), `text-3xl font-extrabold tracking-[0.25em]`, `transform: rotate(-20deg)`, `pointer-events-none select-none`, `aria-hidden="true"`. Confirm it spans the full block via `inset-0 flex items-center justify-center`.
- Internal grid (`relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4`) keeps the four cells:
  1. **Bank Deposit Routing** — masked routing string (`•••• •••• ••••` fallback) via `VoucherCell`.
  2. **Voucher / Check Number** — `V-${statementNo}`.
  3. **Net Pay Distribution** — `formatCurrency(currentNet)`, rendered with `text-2xl font-bold tabular-nums` (currently `text-lg` — bump up so the dollar amount is the visual anchor like an ADP stub).
  4. **Authorized Signature** — underline field: `border-b border-zinc-500 h-10` followed by the 10px uppercase label.

## Out of scope

- No PDF compiler / `generateSettlementPdf` changes — this component is what html2canvas captures, so styling is enough.
- No data field changes (no real routing number wiring).
- No print-only CSS additions beyond keeping existing `print:break-inside-avoid` markers.

## Verification

- `tsgo` typecheck.
- Open a settlement in `/settlements/:id/print` for a W-2 and a contractor driver; confirm:
  - Monospace `CO: JW …` strip at top with light-gray 10px font.
  - All itemization / summary blocks render as flat bordered tables with zebra rows and 1-line-tight padding.
  - Dashed-border voucher appears at the very bottom for BOTH driver types, with the diagonal watermark centered and the Net Distribution number in large bold.
