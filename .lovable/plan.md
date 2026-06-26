## Goal
Align the driver-facing paystub UI (`DriverPayWidget.tsx` + `MyPaystubsDialog.tsx`) with the admin ADP-style settlement layout — same corporate header, dense bordered grids, zebra rows, and detachable check voucher — while hiding accessorial breakdowns from the contractor view.

## Files to change
- `src/components/driver/DriverPayWidget.tsx`
- `src/components/driver/MyPaystubsDialog.tsx`

(No changes to admin components, calculations, or data fetching. Pay total math stays unchanged — accessorials remain rolled into gross/net; only the *visible breakdown* is removed.)

## 1. Corporate ADP Header Block (shared)
Build a small `<PaystubCorporateHeader driverId={driverId} />` helper inside `MyPaystubsDialog.tsx` (and reuse the same markup at the top of the expanded view in `DriverPayWidget.tsx`'s paystub dialog path).

Structure (top → bottom):
```
[ font-mono text-[10px] text-zinc-400 row ]
CO: JW    FILE: {driverId8}    DEPT: DISPATCH    CLOCK: {driverId8}    NUMBER: 00000000

[ bg-zinc-900 text-white px-5 py-4 border border-zinc-900 rounded-none ]
JEANWAY USA                              (text-xl font-bold tracking-wide)
LANDSTAR INWAY, INC. AGENT               (text-xs uppercase tracking-[0.2em] text-zinc-300)
4700 DIPLOMACY RD, FORT WORTH, TX 76155-2627  (text-[11px] text-zinc-400)
```
`driverId8` = `driverId.slice(0,8).toUpperCase()`.

## 2. Dense Grid Matrix (paystub detail view in `MyPaystubsDialog`)
Replace the rounded gradient card (lines 222–324) with a bordered matrix:

- Outer wrapper: `border border-zinc-200 rounded-none shadow-none bg-white`
- Section header bars: `bg-zinc-100 border-b border-zinc-200 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600`
- Rows: 2-col grid (label / amount), `py-1.5 px-3 even:bg-slate-50/50 border-b border-zinc-100 text-sm`
- Amount column: `font-mono tabular-nums text-right`

Sections rendered:
1. **EARNINGS** — single row: `{baseLabel}` → `gross_pay`
2. **REIMBURSEMENTS** — itemized when present (Parking, Tolls, etc. — kept). If only a lump-sum is available, show "Reimbursements" row.
3. **DEDUCTIONS** — itemized if any exist on the settlement; otherwise omit the section.
4. **NET PAY** footer row inside the same grid: `bg-zinc-900 text-white px-3 py-2 font-mono text-lg` with label left, amount right.

## 3. Remove Accessorial Surfaces from Driver View
- `MyPaystubsDialog.tsx`: delete the entire Accessorials `Collapsible` block (lines 260–310), the `accessorialLines` query, `accessorialsTotal`, `accessorialsOpen` state, and the `Package`/`Collapsible*`/`Skeleton` imports that become unused. The accessorial $ stays inside `gross_pay` (no math change).
- `DriverPayWidget.tsx`: delete the "Accessorials & Extras" `Collapsible` block (the section iterating `allAccessorials`) plus `accessorialsOpen` state and unused `Package`/`Collapsible*` imports. Keep `accessorialsTotal` computation only if still used by `calculateWeeklyPay` internals — drop the local `allAccessorials` / `accessorialsTotal` variables since they're only used by the removed UI.

## 4. Detachable Check Voucher Footer
Append below the dense grid in the paystub detail view (mirrors `SettlementCheckVoucher` styling):

```
<div className="mt-6 border-2 border-dashed border-zinc-300 bg-zinc-50/40 p-4 relative min-h-[110px] overflow-hidden">
  {/* diagonal watermark */}
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <span className="-rotate-12 font-mono text-[13px] tracking-[0.3em] text-zinc-300/70 whitespace-nowrap">
      NON-NEGOTIABLE — FOR RECORD PURPOSES ONLY
    </span>
  </div>
  {/* 3-col voucher grid */}
  <div className="relative grid grid-cols-3 gap-4 text-[11px] font-mono">
    <div>
      <p className="text-zinc-500 uppercase tracking-wider">Bank Routing</p>
      <p className="text-zinc-800">XXXX-XXXX-{lastFour}</p>
      <p className="text-zinc-500 mt-2">Acct ••••{lastFour}</p>
    </div>
    <div>
      <p className="text-zinc-500 uppercase tracking-wider">Voucher #</p>
      <p className="text-zinc-800">JW-{settlementIdShort}</p>
    </div>
    <div className="text-right">
      <p className="text-zinc-500 uppercase tracking-wider">Net Pay Distribution</p>
      <p className="font-bold text-lg text-zinc-900 tabular-nums">{formatCurrency(net)}</p>
    </div>
  </div>
  <div className="relative mt-4 pt-2 border-t border-zinc-400/50 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
    Authorized Signature ____________________
  </div>
</div>
```
`lastFour` = static placeholder `'0000'` (no banking data on driver side). `settlementIdShort` = `selected.id.slice(0,8).toUpperCase()`.

## 5. List View (paystub picker)
Keep current list behavior but restyle each row to the same flat aesthetic: replace `rounded-lg` with `rounded-none border border-zinc-200`, `font-mono tabular-nums` on the amount, `even:bg-slate-50/50`. No structural change.

## Out of scope
- No changes to `DriverPayWidget` summary card chrome above the "My Paystubs" button (current week summary remains as is, minus the accessorial collapsible).
- No PDF generator changes (`handleDownload` keeps existing output).
- No data layer changes.

## Verification
- `tsgo` typecheck.
- Playwright at 1280×1800: load `/driver-dashboard`, open "My Paystubs", pick a paystub, screenshot header + grid + voucher. Confirm: no "Accessorial" string visible, header banner present, watermark visible, zebra rows render.
