# Drivers Page: Cleaner Cards + Toolbar + Bulk Select

Refactors `src/pages/Drivers.tsx` presentation only. No schema/API changes.

## 1. New toolbar above the grid

New `<DriversToolbar />` rendered between `PageHeader` and the grid:

- **Search input** — filters by name, email, phone, CDL, Landstar ID (client-side over already-loaded drivers).
- **Status filter** — `Select`: All / Active / Inactive / Onboarding / Archived (uses existing `driver.status`).
- **Sort** — `Select`: Name A–Z, Name Z–A, Recently Hired, Compliance (soonest expiry first).
- **View toggle** — Grid / Table (table view uses existing `DataTable` pattern; keeps parity with other list pages). Persist choice in `localStorage`.
- **Bulk actions bar** appears only when `selectedIds.size > 0`: shows "N selected", `Archive Selected`, `Clear` buttons. Archive runs existing soft-delete mutation in a loop, then a single `notify.undo("N drivers archived", …)` from the new `notify` helper.

All state kept in the page component (`search`, `statusFilter`, `sortBy`, `view`, `selectedIds: Set<string>`). No new context.

## 2. Card redesign (in-place, same file)

The card at lines ~422–592 gets restructured for scannability:

```text
┌──────────────────────────────────────────────┐
│ ☐  [Avatar]  Name                     [•••]  │
│              [Status] [Onboarding]           │
│              Landstar #12345 · CDL A         │
├──────────────────────────────────────────────┤
│ 📞 phone      ✉ email        (icon-only if   │
│                                narrow)       │
├──────────────────────────────────────────────┤
│ Credentials & Compliance                     │
│   License      · exp 12/24  ●                │
│   Medical      · exp 03/25  ●                │
│   MVR          · exp 08/25  ●                │
├──────────────────────────────────────────────┤
│ [View] [Edit] [Archive]                      │
└──────────────────────────────────────────────┘
```

Concretely:
- Left checkbox for bulk select (only shows on hover OR when any driver is selected — same pattern as Gmail).
- Header: avatar + name + badges row + a single meta line (Landstar ID · CDL class) instead of scattered lines.
- Status badges upgraded via a small local helper `driverStatusBadge(status)` returning tone-aware `<Badge>` variants:
  - `active` → `bg-emerald-500/15 text-emerald-500 border-emerald-500/30` (semantic tokens via `success` variant added to Badge if missing — otherwise inline HSL-token classes already used elsewhere).
  - `inactive` → muted/secondary.
  - `onboarding` → `warning` tone (amber via `--warning` if defined, else `secondary` w/ dot).
  - `archived` → outline destructive.
  Small colored dot before the label for glanceability.
- Contact block: phone + email condensed to a single row of icon chips (kept as `<a href>`).
- **Credentials & Compliance** section: keep existing `<CredentialsCompliance variant="section" />` but wrap in a labeled block with consistent `grid-cols-[1fr_auto_auto]` alignment (label · date · status dot). If tightening the internal grid is needed, edit `src/components/drivers/CredentialsCompliance.tsx` in the same pass — only alignment/spacing tweaks, no logic change.
- **Quick actions footer**: three visible buttons — `View` (opens `DriverDetailSheet` = current `setSelectedDriver`), `Edit` (existing `openDialog(driver)`), `Archive` (existing `deleteWithUndo(driver)`). Overflow menu (`•••`) retains View Dashboard, Invite, Signed Documents, etc.

## 3. Files

- **Edit** `src/pages/Drivers.tsx`:
  - Add filter/sort/search/view/selection state.
  - Extract the card body into a local `DriverCard` component (top of file, unexported) to keep the page readable.
  - Add `DriversToolbar` as a local component in the same file.
  - Compute `filteredDrivers` via `useMemo`.
- **Edit** `src/components/drivers/CredentialsCompliance.tsx` (only if needed for alignment): tighten row grid to `grid-cols-[1fr_auto_auto] gap-x-3`.
- **New** none. No new routes, no new tables.

## 4. Out of scope

- No changes to `DriverDetailSheet`, add/edit dialog, banking, i9/w4/w9, or CSV import.
- No server-side filtering — dataset is small and already loaded.
- No changes to StatusBadge globally; the driver-specific tones live in the page helper so other pages are untouched.
- No changes to permissions or archive logic — reuses existing mutation.

## Technical notes

- Bulk archive: iterates `selectedIds` and calls the existing single-driver soft-delete mutation via `Promise.allSettled`, then invalidates `['drivers']` once. Uses `notify.undo` for a single grouped toast; Undo iterates and restores `deleted_at = null`.
- Sort by compliance uses `Math.min(license_expiry, medical_card_expiry, mvr_expiry)` ignoring nulls; nulls sort last.
- All colors go through existing semantic tokens (`--primary`, `--muted-foreground`, `--destructive`, `--warning` if present) — no hardcoded hex.
- Checkbox column stays keyboard-accessible (`Space` toggles, focus ring via existing `Checkbox`).
