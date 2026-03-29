

## Plan: Add TMS Mode (Landstar BCO vs Independent) to Organization Setup

### Overview
Add a `tms_mode` column to organizations and wire it through onboarding, sidebar navigation, settings, and a reusable hook.

---

### 1. Database Migration

**Add column + backfill:**
```sql
ALTER TABLE organizations ADD COLUMN tms_mode text NOT NULL DEFAULT 'landstar';
```
All existing orgs already get `'landstar'` via the default.

**Update `create_onboarding_org` RPC** to accept an optional `_tms_mode` parameter and set it on the new org row.

---

### 2. Onboarding UI (`src/pages/Onboarding.tsx`)

- Add `tmsMode` state (`'landstar' | 'independent'`), defaulting to `'landstar'`.
- At the top of Step 1, render two selectable cards: "I am a Landstar BCO" and "I have my own DOT/MC Authority".
- Conditionally show/hide DOT and MC fields based on selection:
  - Landstar: hide DOT/MC fields entirely.
  - Independent: show DOT/MC fields, make them required (block Continue if empty).
- Pass `_tms_mode` to the `create_onboarding_org` RPC call (requires updating the RPC to accept it).

---

### 3. `useOrganizationMode` Hook (`src/hooks/useOrganizationMode.ts`)

- New hook that queries `organizations.tms_mode` for the current user's org (using `orgId` from `useAuth()`).
- Returns `{ tmsMode: 'landstar' | 'independent', isLoading }`.
- Uses `react-query` with key `['org-tms-mode', orgId]`.

---

### 4. Sidebar Navigation (`src/components/layout/AppSidebar.tsx`)

- Import `useOrganizationMode`.
- Add a `tmsMode` filter to nav items using a new optional `tmsMode` property on `NavItem`:
  - `'landstar'` — item only shows in Landstar mode.
  - `'independent'` — item only shows in Independent mode.
  - `undefined` — always shows.
- Specific changes:
  - "CRM" item: always visible (label stays "CRM").
  - "IFTA Reporting": mark as `tmsMode: 'independent'` (Landstar handles IFTA).
  - No items are removed from Landstar mode at this stage — existing nav stays. Future iterations can add "Direct Invoices" and "Authority Compliance" pages for independent mode.

---

### 5. Settings Company Tab (`src/components/settings/CompanyTab.tsx`)

- Import `useOrganizationMode`.
- Display current mode as a read-only badge ("Landstar BCO" or "Independent Owner-Operator").
- If `tmsMode === 'landstar'`: hide DOT/MC fields (Landstar's corporate authority applies).
- If `tmsMode === 'independent'`: show editable DOT/MC fields (already partially present via the org update flow — need to add them to this tab).

---

### 6. AuthContext Update (`src/contexts/AuthContext.tsx`)

- Fetch `tms_mode` alongside existing org data query and expose it on the context as `tmsMode`. This avoids a separate query in the hook — the hook can just read from AuthContext instead.

---

### Files

| File | Action |
|------|--------|
| Migration SQL | Create — add `tms_mode` column, update `create_onboarding_org` RPC |
| `src/contexts/AuthContext.tsx` | Edit — fetch and expose `tmsMode` |
| `src/hooks/useOrganizationMode.ts` | Create — convenience hook reading from AuthContext |
| `src/pages/Onboarding.tsx` | Edit — add mode selector cards, conditional DOT/MC fields |
| `src/components/layout/AppSidebar.tsx` | Edit — filter nav items by `tmsMode` |
| `src/components/settings/CompanyTab.tsx` | Edit — show mode badge, conditionally show/hide DOT/MC |

