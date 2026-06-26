# Settlement Detail: dual-column paystub layout

Scope is only `src/components/finance/driver-settlements/SettlementDetailSheet.tsx`. No DB or pricing logic changes.

## 1. Replace the two stacked sections with a single split grid

Today the sheet renders `<ReimbursementSection />` and `<DeductionSection />` side-by-side (lg+) but each owns its own table, header, and add-row state. I'll consolidate into a single `<LineItemsSplit />` block placed below trip routing/earnings:

```text
┌─────────────────────────────────┬─────────────────────────────────┐
│ EARNINGS & ADDITIONS            │ DEDUCTIONS & ESCROWS            │
├─────────────────────────────────┼─────────────────────────────────┤
│ Description           Amount    │ Description           Amount    │
│ Load 8821 DFW → ATL    $1,420   │ Truck Lease            -$650    │
│ Detention               $120    │ Escrow @ $0.10/mi      -$94     │
│ Lumper reimbursement    $85     │                                 │
│ + Add Manual Line Item          │ + Add Manual Line Item          │
└─────────────────────────────────┴─────────────────────────────────┘
```

- **Left "EARNINGS & ADDITIONS"** — rows where `item_type IN ('load_pay', 'accessorial', 'reimbursement')`. Schema uses `load_pay` (verified via the generate-settlements RPC); I'll also accept `load_earnings` defensively in case a future seed uses that name. Empty fallback: `"No earnings recorded yet"`.
- **Right "DEDUCTIONS & ESCROWS"** — rows where `item_type = 'deduction'`. Escrow-flagged rows (`is_escrow = true`, added in the previous migration) get a small `Escrow` chip next to the description. Empty fallback (literal copy from the spec): `"No deductions in this period"` in `text-muted-foreground text-sm italic`.

Both columns share a column-header row and identical row structure so they read like opposing halves of a paystub.

## 2. Inline "+ Add Manual Line Item" affordance

Replace the current "Add" button + collapsible card pattern with a persistent inline row at the bottom of each column, visible only when `settlement.status === 'draft'`:

```text
+ Add Manual Line Item           [ description ] [ $ amount ] [ Add ]
```

- Click on the `+ Add Manual Line Item` text expands the input row in place (no modal, no card).
- Description is free text. Amount is `<Input type="number" step="0.01">` so cents are preserved exactly.
- Submit calls `supabase.from('driver_settlement_items').insert({...})` with the matching `item_type` (`reimbursement` for left, `deduction` for right) then `recalc_settlement_totals` to refresh gross/net.
- Left column inserts as `reimbursement`. To keep the existing deduction preset list ("Escrow", "Plate Fee", …) accessible, the right column gets a small `Preset ▾` chooser inline next to description — picking a preset autofills description and toggles `is_escrow=true` for "Escrow".

Per-row delete (trash icon) remains, gated on draft status.

## 3. Data density & zebra striping

Apply paystub-density styles to every row in both tables:

- Cells: `className="py-1.5 px-3"` on both `<TableHead>` and `<TableCell>`.
- Rows: `className="even:bg-muted/40"` for zebra striping.

The user's spec says `even:bg-slate-50/50`, but per the project's design-token rule we never hardcode `slate-*`. `even:bg-muted/40` is the semantic equivalent and preserves dark-mode support. I'll call this swap out in the closing message.

Numbers stay right-aligned and tabular-num for paystub readability. Negative (deduction) amounts render in `text-destructive` and prefixed with `-`.

## 4. Cleanup

- Delete the standalone `ReimbursementSection` and `DeductionSection` components from this file (they're not imported elsewhere — verified by the search that surfaced this file).
- Keep the four `SummaryStat` tiles, the Year-to-Date card, the discrepancy panel, and `<EarningsBreakdown />` unchanged.
- PDF export, status badges, and the recalc RPC wiring are unchanged.

## Out of scope

- Sub-table for trip-level load pay (lives in `<EarningsBreakdown />` already).
- Editing existing line items in place (current behavior is delete + re-add; keeping that).
- New columns on `driver_settlement_items`.
- Print/PDF template changes — only the on-screen sheet is updated.

Approve to implement.
