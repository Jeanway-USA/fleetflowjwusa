## Goal
Clean up the visual bugs in the generated settlement PDF so it renders as a pristine, official paystub.

## Issues confirmed from the attached PDF
1. **Garbled `!'` next to "Origin"** — the Unicode arrow `→` we pass into headers and load rows isn't in the default helvetica WinAnsi encoding, so the PDF reader prints `!'` instead of an arrow. Visible in both the column header ("Origin !' Destination") and every load row ("Lewisville, TX … !' Hughes Supply, …").
2. **Address column stretching / squeezing other columns** — the Origin → Destination column has no explicit width, so a long combined origin+destination string consumes most of the row width and pushes the Miles/Status columns to the edge of the page.
3. **Other small clipping/spacing artifacts** — long single-line strings (full statement ID, long addresses, long reimbursement descriptions) can clip because columns rely on autotable's auto-sizing instead of explicit widths with `overflow: 'linebreak'`.

## Fix (scope: PDF generator only)
Edit `src/lib/pdf/generateSettlementPdf.ts`:

1. **Replace the Unicode arrow with a WinAnsi-safe separator** everywhere it appears in PDF text:
   - Column headers: `'Origin → Destination'` → `'Origin / Destination'` (or `'Origin to Destination'`).
   - Load row body cells: `` `${origin} → ${destination}` `` → `` `${origin}  →  ${destination}` `` replaced with `` `${origin}\n→\n${destination}` `` won't help — instead use a plain ASCII separator like `' → '` swapped to `'  »  '`… use a safe glyph: switch to ` / ` (slash) for the visible separator, or better, split origin and destination into **two separate columns** so the relationship is obvious without any special character.
   - Decision: split into two columns (`Origin` and `Destination`) for the Flat / CPM / Percentage tables. This both removes the arrow problem and makes long addresses wrap naturally inside their own column.
   - Also scrub the period strip dash (`–`) and the formula label (e.g. `1,200 mi × $0.65/mi`): replace `×` with `x` and `–` with `-` to stay inside WinAnsi.

2. **Pin column widths and enable line-break overflow** on every autotable so nothing overflows the page:
   - Compute `tableWidth = W - margin*2` and assign explicit `columnStyles[i].cellWidth` for every column. Suggested widths for the Flat table (in pts, total ≈ 515): Date 60, Load # 70, Origin 150, Destination 150, Miles 45, Status 40.
   - Set `styles.overflow: 'linebreak'` and `styles.cellWidth: 'wrap'` on all autotables so long addresses wrap inside the cell instead of pushing the table.
   - Same treatment for CPM (Date/Load/Origin/Destination/Miles/Rate/Amount) and Percentage (Date/Load/Origin/Destination/Linehaul/After Split/Driver %) tables, recomputing widths so they sum to the available content width.
   - Reimbursements table: explicit `cellWidth` for Description and Amount with `overflow: 'linebreak'` for long descriptions.

3. **Header right-column safety** — the driver block in the dark header right-aligns email/phone. Clamp it with `doc.splitTextToSize(..., 240)` so a long email never bleeds into the org name on the left.

4. **Pay Calculation band** — the formula string is right-aligned and can theoretically overrun the label on the left. Truncate with `splitTextToSize` to `(W - margin*2 - 130)` and shrink font to 10pt if it wraps.

5. **Footer tax-note wrap math** — `contactWrapped` is positioned using `wrapped.length * 9`, but font size is 7.5 so line height should be ~10. Adjust to `wrapped.length * 10` so the contact line doesn't sit on top of the tax note when the tax note wraps to two lines.

## What's NOT changing
- No changes to settlement business logic, SQL, breakdown helper, or UI components.
- No font embedding (keeps bundle size and avoids new assets); we stay in WinAnsi-safe characters instead.

## Verification
After implementing, re-render a settlement PDF (same Timothy Ames example), convert to image with `pdftoppm -jpeg -r 150`, and visually confirm:
- No `!'` artifacts anywhere.
- Origin and Destination each occupy their own column and wrap cleanly.
- Miles and Status columns are fully visible on the right edge.
- Header, formula band, and footer text never clip or overlap.

## Technical Details
- File touched: `src/lib/pdf/generateSettlementPdf.ts` only.
- jsPDF + jspdf-autotable APIs used: `columnStyles[i].cellWidth`, `styles.overflow: 'linebreak'`, `doc.splitTextToSize`.
