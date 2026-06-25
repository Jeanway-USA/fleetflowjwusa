## Mobile-friendly Settlement Detail Sheet + Generate Dialog

### Problems
1. **Can't dismiss the detail sheet on mobile** — `SettlementDetailSheet` uses the chat-style pattern (`SheetContent` with `p-0 flex flex-col` plus an inner `flex-1 overflow-y-auto`) but does NOT pass `overflow-hidden` to `SheetContent`. Per our Sheet structure convention, that combination breaks scroll/close behavior — the `X` close button ends up outside the touch area on small screens, forcing a refresh. There is also no explicit "Close" button at the bottom.
2. **Tables overflow horizontally** on a 393px viewport (Earnings Breakdown 5–6 columns, Reimbursements 3 columns) with no wrapper — content gets clipped/stretched and tapping rows scrolls the body instead of letting you reach the bottom controls.
3. **Generate Settlements dialog** is cramped on mobile: 3 date pickers in a single horizontal grid (already responsive to `sm:`, but the popovers, badges, and footer buttons need tightening).
4. **Reimbursement add-form** controls are usable on mobile but the Add/Cancel buttons are small; the description field is fine.

### Fixes (UI/presentation only — no business logic changes)

**`SettlementDetailSheet.tsx`**
- Add `overflow-hidden` to `SheetContent` (chat-style pattern fix) so the internal `flex-1 overflow-y-auto` body scrolls properly and the absolute X close button stays reachable.
- Tighten responsive padding: `px-4 sm:px-6`, `pt-5 sm:pt-6`, header title size `text-base sm:text-lg`, allow title to wrap and let the status badge drop below on narrow screens.
- Move the **Download PDF** button into its own row under the period strip on mobile (`flex-col sm:flex-row`), full-width on mobile (`w-full sm:w-auto`).
- Summary stats: change `grid-cols-3` to `grid-cols-1 sm:grid-cols-3` so each stat is full-width on phones (Gross / Reimbursements / Net stack vertically with larger tap-friendly numbers).
- YTD card: same `grid-cols-1 sm:grid-cols-3` treatment.
- Wrap every breakdown `<Table>` in `<div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">` so wide tables scroll horizontally inside the sheet instead of breaking the layout. Add `min-w-[560px]` (flat), `min-w-[640px]` (per-mile/percentage) so columns stay readable while scrolling.
- Reimbursement table wrapped the same way.
- Add a **sticky bottom action bar** inside the sheet body container (outside the scroll area): a full-width "Close" button on mobile (`sm:hidden` or always visible, with `Download PDF` beside it on desktop). This gives a guaranteed way out without relying on the small `X`.

**`GenerateSettlementsDialog.tsx`**
- The dates grid is already `grid-cols-1 sm:grid-cols-3` — verify, and reduce the per-button label size on mobile (truncate the `format(d,'PPP')` to `'MMM d, yyyy'` so it fits a 393-px row without wrapping).
- Footer: stack `Cancel`/`Generate` full-width on mobile (`flex-col-reverse` is already on the shared `DialogFooter`, just need `w-full sm:w-auto` on each button).
- Driver multi-select popover: cap height (`max-h-[60vh]`) and ensure the trigger is `h-11` on mobile for touch.

### Verification
- Drive Playwright at 393×800 viewport: open Finance → Driver Settlements → click a settlement row. Confirm:
  - Sheet opens, body scrolls, X close button is tappable, and the new bottom **Close** button dismisses the sheet.
  - All three breakdown table variants scroll horizontally without clipping the sheet.
  - Open Generate dialog; all three date pickers fit; footer buttons full-width and reachable.
- Screenshot before/after at the same viewport.

### Out of scope
No SQL, RPC, or data-fetching changes. PDF generator untouched.
