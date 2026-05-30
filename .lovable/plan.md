## Plan: Credentials & Compliance Section in Admin Driver Views

### Problem
Driver credential data (license, medical card, TWIC, endorsements) is either mixed into general cards without clear grouping (`Drivers.tsx`) or entirely absent (`DriverSpectatorView.tsx`). Expiry warnings are minimal text-color changes, not the required StatusBadge visual helpers.

### Changes

#### 1. `src/components/shared/StatusBadge.tsx`
Extend the `statusMap` so the shared badge component can render credential expiry states:
- `"expiring_soon"` → `warning` (yellow)
- `"expired"` → `error` (red)

#### 2. `src/pages/Drivers.tsx` — Admin driver card grid
Replace the current scattered credential rows with a clear **"Credentials & Compliance"** bordered section inside each driver card.

**Display fields:**
- License Number
- Endorsements (as existing compact badges)
- TWIC status: "Yes" or "No"
- License Expiry Date
- DOT Medical Card Expiry Date
- TWIC Expiry Date (only if `has_twic`)

**Date status logic:**
- If date is in the past → red `StatusBadge` label: **"Expired"**
- If date is within 30 days of today → yellow `StatusBadge` label: **"Expiring Soon"**
- Otherwise → no badge

#### 3. `src/pages/DriverSpectatorView.tsx` — Read-only detail view
Add a new `Card` titled **"Credentials & Compliance"** below the header banner. Show the same six fields and identical date-status badge logic as above.

### Out of Scope
- No database migrations (columns already exist).
- No changes to the Add/Edit driver dialog form.
- No changes to the onboarding wizard or document templates.

### Technical Details
- Reuse existing `isExpiringSoon()` logic but split it to distinguish `expired` (past) from `expiring_soon` (≤30 days).
- Use `parseISO` and `isBefore`/`isAfter` from `date-fns` for date comparisons.
- Reuse the existing `formatDate()` helper in `Drivers.tsx`.