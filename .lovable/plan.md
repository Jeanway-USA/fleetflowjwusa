## Goal

Deliver a verification-grade Settlement Statement in two surfaces that share the exact same layout & data:

1. A new **on-screen printable React view** (`SettlementPrintable.tsx`) styled per the Tailwind spec — opens in a dedicated print route and is what the user actually sees before downloading.
2. The **downloadable PDF** (`generateSettlementPdf.ts`) rebuilt with `jsPDF` to mirror that exact layout, saved as `Settlement_<LastName>_<period_end>.pdf` (e.g. `Settlement_Ames_2026-06-23.pdf`).

The detail sheet keeps its existing "Download PDF" button and gains a "Preview Statement" button that opens the printable view in a new tab.

## Corporate header (clarified)

User is a Landstar BCO with a fleet — **not a Landstar agent yet**. So the hardcoded header is:

- Title 1: `JEANWAY LLC`
- Title 2: `LANDSTAR BCO` *(replaces the originally-requested "LANDSTAR INWAY, INC. AGENT")*
- Address: `4700 DIPLOMACY RD, FORT WORTH, TX 76155-2627`

When the org later promotes to an Inway agent we can flip this single constant (or make it pull from `company_settings`) without touching layout. Flagging this as the only spec deviation from the original message.

## Layout (identical on screen and in PDF)

```
+--------------------------------------------------------------+
|  [bg-slate-900 / text-white band, py-8 px-10]                |
|   JEANWAY LLC                       SETTLEMENT &             |
|   LANDSTAR BCO                      EARNINGS STATEMENT       |
|   4700 DIPLOMACY RD,                Statement #XXXXXXXX      |
|   FORT WORTH, TX 76155-2627         [STATUS BADGE]           |
+--------------------------------------------------------------+
|  STATEMENT DETAILS         |  CONTRACTOR INFORMATION         |
|  Statement # / Pay Period  |  Driver Name / Driver ID        |
|  Payment Date / Status     |  Email / Phone                  |
+--------------------------------------------------------------+
|  LOAD EARNINGS & ROUTES                                      |
|  Date | Load # | Miles | Status | Origin | Destination       |
|  (multi-line address wrapping, no truncation)                |
+--------------------------------------------------------------+
|  EARNINGS & REIMBURSEMENTS (itemized, right-aligned $)       |
+--------------------------------------------------------------+
|  +-- CURRENT PERIOD ----+   +-- YEAR-TO-DATE -----+          |
|  | Gross / Reimb / NET  |   | YTD Gross/Reimb/NET |          |
|  +----------------------+   +---------------------+          |
|     Net Pay = Gross Pay + Reimbursements                     |
+--------------------------------------------------------------+
| 12px italic legal disclosure (full width)                    |
| Generated …                              Page X of Y         |
+--------------------------------------------------------------+
```

## Files

### NEW `src/components/finance/driver-settlements/SettlementPrintable.tsx`
Pure presentational React component, container:
```
max-w-4xl mx-auto p-8 bg-white text-zinc-900 shadow-sm print:shadow-none print:p-0
```
- Header banner: `bg-slate-900 text-white px-10 py-8` with the three hardcoded lines above, status pill on the right (DRAFT zinc / PENDING amber / APPROVED slate / PAID-FINAL emerald).
- Sections separated by `border-t border-zinc-200`, each marked `print:break-inside-avoid`.
- Two-column metadata via `grid grid-cols-1 md:grid-cols-2 gap-8 py-6`. Contractor card wrapped in `border border-zinc-200 rounded-md p-4`.
- Load table: `<table class="w-full text-sm border-collapse">`, `whitespace-normal align-top`, `even:bg-zinc-50`.
- Itemized rows: `flex justify-between border-b border-zinc-100 py-2 tabular-nums`.
- Dual summary cards: `grid md:grid-cols-2 gap-4`, each `border rounded-lg overflow-hidden` with a `bg-slate-900 text-white` header bar and a highlighted Net row (`bg-slate-50 font-semibold text-base`).
- Footer: `text-[12px] italic text-zinc-600 border-t pt-4` exact disclosure text, plus `flex justify-between text-[10px] text-zinc-500 pt-2` for `Generated …` / `Page 1 of 1`.

Takes a fully-resolved `SettlementDocumentData` prop. No data fetching inside.

### NEW `src/lib/settlement-document-data.ts`
`buildSettlementDocumentData(settlementId)` — shared loader returning `{ settlement, driver, org, items, breakdown, ytd }`. Wraps the existing queries in `generateSettlementPdf` plus a YTD aggregate (`SUM(gross_pay)/reimbursements/net_pay` over the driver's `approved|paid|pending_approval` settlements in the same calendar year as `period_end`). Both the printable view and the PDF renderer consume it.

### NEW route `src/pages/SettlementPrint.tsx` + register in `App.tsx`
- Route: `/settlements/:id/print` (protected: owner / dispatcher / payroll_admin / the settlement's own driver).
- Renders `<SettlementPrintable data={...} />` plus a no-print toolbar with **Print / Save as PDF** (`window.print()`) and **Download PDF** (calls `generateSettlementPdf(id)`).

### EDIT `src/lib/pdf/generateSettlementPdf.ts` (full rewrite)
- Consume `buildSettlementDocumentData` instead of fetching inline.
- Hardcode the 3-line corporate header in the navy banner (`JEANWAY LLC` / `LANDSTAR BCO` / address). Org `logo_url` still loads to the left when present.
- Status pill → filled rounded rect with white bold text. Mapping: `pending_approval` PENDING (`#D97706`), `approved` APPROVED (`#475569`), `paid` PAID (`#059669`), else DRAFT (`#71717A`).
- Two-column Statement Details / Contractor Information block under the banner with hairline `#E4E4E7` dividers.
- Load table via `autoTable`: Date · Load # · Miles · Status · Origin · Destination. `overflow: 'linebreak'`, `cellPadding: 6`, `minCellHeight: 22`. Origin/Destination get the widest share — addresses wrap, never ellipsize. Pay-type-aware footer totals (Flat / CPM / Percentage variants preserved).
- Itemized Earnings & Reimbursements list (text rows, right-aligned $) drawn before summary cards.
- Dual summary cards: CURRENT PERIOD + YEAR-TO-DATE. Navy header, highlighted Net row (`bg #F1F5F9`, 13pt bold). Numbers recomputed defensively as `net = gross + reimb`.
- "Net Pay = Gross Pay + Reimbursements" caption directly under the cards (8pt italic zinc).
- Every-page footer: 10pt italic full-width disclosure (exact spec text) above a hairline rule, `Generated <ts>` bottom-left, `Page X of Y` bottom-right (zinc-500, 8pt).
- Pagination safety: before each major block check remaining height against `H − footerReserve` and `addPage()` if needed. Footer reserve derived from wrapped disclosure line count so it never overlaps or produces a trailing blank page.
- Filename: `Settlement_<LastName>_<period_end YYYY-MM-DD>.pdf` (already matches `Settlement_Ames_2026-06-23.pdf` — verified).

### EDIT `src/components/finance/driver-settlements/SettlementDetailSheet.tsx`
Add a **Preview Statement** button next to **Download PDF** that opens `/settlements/:id/print` in a new tab (`window.open(url, '_blank', 'noopener')`). No other layout / logic changes.

## Technical notes

- Currency via existing `formatCurrency`; dates via `date-fns` with the `T00:00:00` guard.
- Print styles live inside the printable component as Tailwind `print:` variants — no global CSS.
- YTD aggregate is one extra query in the shared loader; no SQL / schema / edge-function changes.
- Pure frontend + PDF renderer; no business-logic changes.

## Out of scope

- Making the corporate subtitle (`LANDSTAR BCO` ↔ `LANDSTAR INWAY, INC. AGENT`) configurable through `company_settings`. Flagged as a follow-up the moment Inway agent status is approved.
- Settlement generation / approval / payment flows.
- Detail-sheet mobile tweaks beyond the new Preview button.