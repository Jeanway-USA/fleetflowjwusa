# Scaffold a Payroll Setup page for clearing Gusto blockers

## Goal

A new per-organization Settings page that will host the guided workflows to clear Gusto payroll blockers (bank, signatory, tax setup, etc.). This turn is **scaffold only** — layout, tabs, empty section placeholders, and a placeholder blocker-count badge. No Gusto API wiring yet.

## Where it lives

- **Route:** `/settings/payroll-setup`
- **Access:** `owner` and `payroll_admin` (matches existing payroll access rules).
- **Entry point:** new link in the Finance page's payroll area and in the main Settings page ("Payroll Setup"). Left the existing `/settings` page untouched.

## Page structure

```text
┌──────────────────────────────────────────────────────────────┐
│ Payroll Setup                     [Badge: — blockers]        │
│ Clear the items below before running W-2 payroll.            │
├──────────────────────────────────────────────────────────────┤
│ [Company & Industry] [Signatory] [Bank Details] [Tax Setup]  │
│ ── active tab content ────────────────────────────────────── │
│  Section header + short description                          │
│  Placeholder card: "Guided setup coming soon"                │
└──────────────────────────────────────────────────────────────┘
```

- Uses shadcn `Tabs` on `sm+` and collapses to shadcn `Accordion` on mobile (`< sm`) via a simple `useIsMobile` split so all four sections stay reachable on a phone.
- Each section renders a `Card` shell with title, description, and a muted placeholder body — ready for follow-up work to drop the real forms/flow-token launchers in.
- Status indicator: shadcn `Badge` at top-right of the header, currently displays `—` with a neutral variant. Component prop-typed to accept `{ count, isLoading }` so wiring it to the Gusto onboarding endpoint later is a one-line change.

## Files to add

- `src/pages/PayrollSetup.tsx` — page component, header, badge, tabs/accordion switch, four section stubs.
- `src/components/payroll/setup/PayrollBlockerBadge.tsx` — reusable `<PayrollBlockerBadge count?: number | null />`.
- `src/components/payroll/setup/sections/CompanyIndustrySection.tsx`
- `src/components/payroll/setup/sections/SignatorySection.tsx`
- `src/components/payroll/setup/sections/BankDetailsSection.tsx`
- `src/components/payroll/setup/sections/TaxSetupSection.tsx`

Each section file exports a small component with a shared shape (`title`, `description`, placeholder `Card` body) so they're easy to fill in later.

## Files to edit

- `src/App.tsx` — add `<Route path="/settings/payroll-setup" allowedRoles={['owner','payroll_admin']}>` importing `PayrollSetup`.
- `src/pages/Settings.tsx` — add a "Payroll Setup" entry linking to the new route (keeps discoverability without changing the existing settings layout).
- `src/components/finance/payroll/RunW2PayrollDialog.tsx` — small "Setup incomplete? Open Payroll Setup →" link in the left panel that navigates to the new page. Non-blocking, purely a shortcut.

## Responsiveness

- `< sm`: single-column, `Accordion` (`type="single"`, `collapsible`) with all four sections; header stacks title above badge.
- `sm` and up: header row (title left, badge right), `Tabs` with a horizontally scrollable `TabsList` so long labels never clip.
- Consistent `container mx-auto p-4 sm:p-6 max-w-5xl` wrapper, no `DashboardLayout` wrapper (per project rule — `ProtectedRoute` provides it).

## Out of scope this turn

- No calls to the `run-w2-payroll` edge function.
- No form fields inside the sections yet.
- No real blocker count — badge shows `—` until we wire the Gusto onboarding-status endpoint in a follow-up.
