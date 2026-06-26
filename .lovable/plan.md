## `generateSettlementPdf.ts` — admin-grade tabular refactor

Goal: produce a PDF whose visual structure mirrors the on-screen admin/driver settlement layout — top mono tracker, dense bordered grids with zebra rows, no accessorial line, and a dashed detachable voucher with a true 45° watermark at the page base.

### 1. Top monospace administrative tracker line
Add a single mono row at the absolute top margin (above the dark banner):

```
CO: JW    FILE: <ID8>    DEPT: DISPATCH    CLOCK: <ID8>    NUMBER: 00000000
```

- `doc.setFont('courier', 'normal')`, 7.5pt, color `113,113,122` (zinc-500).
- Drawn at `y = 18`, page-centered or left-aligned at `margin`. Shift the dark `HEADER_H` banner down by ~14pt so it starts at `y = 24` instead of `0` (revise the existing `doc.rect(0, 0, W, HEADER_H, 'F')` accordingly).

### 2. Replace open-text sections with bordered grid tables
Use a single `autoTable` helper `denseGrid({ head, rows, startY, headBg, redCol })` that applies the on-screen tokens:

- `theme: 'grid'` → hairline cell borders.
- `styles: { lineColor: [228,228,231], lineWidth: 0.4, cellPadding: { top: 2.5, bottom: 2.5, left: 6, right: 6 }, fontSize: 9, font: 'helvetica' }` (≈ Tailwind `py-1.5 px-3`).
- `alternateRowStyles: { fillColor: [248, 250, 252] }` (zebra slate-50/50).
- `headStyles: { fillColor: [244,244,245], textColor: [82,82,91], fontStyle: 'bold', fontSize: 8 }` (mono-feel section header bar, matches `bg-zinc-100`).
- No `borderRadius`; `tableLineColor` + `tableLineWidth` set to the same hairline.

Apply this helper to:

- **Statement Details** (left) and **Contractor Information** (right) — drop the current label/value free-text rendering and replace with two side-by-side bordered tables (`tableWidth: colW`, `margin` adjusted per column).
- **Load Earnings & Routes** — already uses `autoTable`; rework `styles`/`headStyles`/`alternateRowStyles` to match the helper (smaller padding, slate-50 zebra, zinc-200 borders, zinc-100 head).
- **Earnings & Additions** and **Deductions & Escrows** — same restyle, dense padding, hairline borders.
- **Summary cards** — keep visual hierarchy but redraw as a bordered 2-column grid (no rounded corners; `roundedRect → rect`) with the zinc-900 header bar preserved and the Net Pay band kept solid slate-100.

### 3. Hide accessorials from itemization
Accessorial $ already lives inside `breakdown.basePay` / `s.gross_pay`. Ensure the PDF never adds a dedicated Accessorial row:

- Defensive filter on `reimbursementItems` before building `earningsBody`:
  ```ts
  const visibleReimb = reimbursementItems.filter(r => {
    const t = (r.description ?? '').toLowerCase();
    return !t.includes('accessorial');
  });
  ```
- Remove any "Accessorials" foot/label text from the Load Earnings table footer (the current footer only shows base pay math — confirm unchanged).
- No math change — totals continue to come from `currentGross/Reimb/Ded/Net`, so the visible base pay line keeps absorbing accessorials silently.

### 4. Always-on detachable check voucher at page base
Remove the `opts.includeVoucher` gate so the voucher renders by default. Reserve voucher space against `FOOTER_RESERVE` so it sits at the absolute base of the final page (push to a fresh page if it would overlap the footer):

- Frame: `border-2 border-dashed border-zinc-300 bg-zinc-50/40 p-4` equivalent →
  ```ts
  doc.setFillColor(250, 250, 251);            // ~ zinc-50/40
  doc.rect(vx, vy, vw, vh, 'F');
  doc.setDrawColor(212, 212, 216);            // zinc-300
  doc.setLineWidth(1.5);
  doc.setLineDashPattern([5, 4], 0);
  doc.rect(vx, vy, vw, vh, 'S');              // squared corners, no roundedRect
  doc.setLineDashPattern([], 0);
  ```
- **45° watermark** spanning the voucher center:
  ```ts
  const gs = new (doc as any).GState({ opacity: 0.10 });
  (doc as any).setGState(gs);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(120, 120, 130);
  doc.text(
    'NON-NEGOTIABLE - FOR RECORD PURPOSES ONLY',
    vx + vw / 2,
    vy + vh / 2 + 6,
    { align: 'center', angle: 45 },           // <- exact 45°, was 18°
  );
  (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
  ```
- Keep Pay To / Amount / Amount-in-words / Bank Routing / Voucher # / Pay Date / Memo fields and signature line — they already match the on-screen voucher.

### Verification
- Generate a sample PDF for a real settlement, render with `pdftoppm -jpeg -r 150 settlement.pdf p` and visually inspect each page for:
  - Top mono tracker present and not clipped.
  - All data blocks enclosed in hairline grids with zebra rows.
  - No "Accessorial" line under Earnings & Additions even when one exists in `reimbursementItems`.
  - Voucher at page base with dashed frame and a 45° watermark crossing its center.
  - No overlap between voucher and footer disclosure.
- `tsgo` typecheck.

### Out of scope
- No data layer / RPC changes.
- No changes to driver dialog or admin sheet — only `generateSettlementPdf.ts`.
