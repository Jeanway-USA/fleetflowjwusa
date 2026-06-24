
# Site-Wide Quality-of-Life Pass

A heavy, opinionated polish sweep touching forms, tables, navigation, and mobile across the whole app. Built around a handful of new shared primitives so every page benefits without rewriting page-level code.

---

## 1. Global Command Palette (⌘K / Ctrl+K)

A single keyboard-driven launcher that works from any page.

- **New:** `src/components/shared/CommandPalette.tsx` using shadcn `cmdk` (`Command`, `CommandDialog`).
- Mounted once in `App.tsx` inside `ProtectedRoute` so it follows the authed shell.
- Global hotkey listener (`⌘K` / `Ctrl+K`, `/` when not in an input) toggles it.
- Sections:
  - **Jump to page** — every route the user has access to (role-gated via existing `useAuth` role).
  - **Recents** — last 8 visited loads, drivers, trucks, contacts (stored in `localStorage` key `jw-recents`).
  - **Quick actions** — "New Load", "New Work Order", "New Contact", "New Expense" — calls page-level openers via a tiny event bus (`window.dispatchEvent(new CustomEvent('jw:quick-action', { detail: 'new-load' }))`).
  - **Search** — fuzzy across loads (load #), drivers (name), trucks (unit #), contacts (company/agent code). Debounced 200ms, queries existing tables filtered by `org_id`, `limit 8` per type.
- Result selection navigates or fires the action, then closes.

## 2. Recents + Breadcrumbs

- **New:** `src/hooks/useRecents.ts` — `pushRecent({ type, id, label, href })`, capped at 20, deduped.
- Wire into the detail openers we already have: Load detail dialog, Driver detail sheet, Truck history drawer, CRM contact sheet. One-line `useEffect` per opener.
- **New:** `src/components/shared/Breadcrumbs.tsx` — derives crumbs from `useLocation()` + a small route→label map; renders under page header on detail-style pages (Loads, Maintenance, CRM, Drivers, Trucks, Trailers, Finance, IFTA, Safety, Settings).

## 3. Form UX Primitives

Roll these into the highest-traffic forms first: FleetLoads create/edit, IndependentLoadBuilder, NewWorkOrderSheet, ContactFormDialog, Driver onboarding wizard, Settings tabs.

- **New:** `src/hooks/useFormShortcuts.ts` — binds `Enter` to submit (skipped in `<textarea>` unless `⌘/Ctrl+Enter`), `Esc` to close, `⌘/Ctrl+S` to save without closing. Accepts `{ onSubmit, onCancel, onSaveDraft, disabled }`.
- **New:** `src/hooks/useDraftAutosave.ts` — debounced (1s) write of form state to `localStorage` keyed by `jw-draft:<formId>:<orgId>:<userId>`. Restores on mount with a dismissible "Restore draft from 3m ago?" banner. Clears on successful submit. Opt-in per form via `formId`.
- **New:** `src/components/shared/StickySaveBar.tsx` — appears at the bottom of long forms when dirty, on mobile becomes a fixed bottom bar above safe-area. Shows "Unsaved changes • Save / Discard". Used by Settings tabs, NewWorkOrderSheet, IndependentLoadBuilder.
- **New:** `src/components/shared/FormField.tsx` thin wrapper standardizing label / required marker / inline error / helper text spacing. Optional — used in new code; existing fields untouched.
- Focus management: every dialog/sheet opens with focus on its first input (already partial — make consistent), returns focus to the trigger on close.

## 4. Table Primitives

- **New:** `src/components/shared/DataTable/` — `DataTable.tsx`, `TableSkeleton.tsx`, `TableEmptyState.tsx`, `TableToolbar.tsx`, `useTablePrefs.ts`.
  - Sticky header (`position: sticky; top: 0` inside a scroll container).
  - Column resize via mouse drag on header divider; widths persisted per table id in `localStorage`.
  - Sort + page-size persisted per table id.
  - Bulk-select column with checkbox + sticky bulk-action bar (count + actions slot).
  - Standard empty state (icon + headline + CTA slot) and consistent skeleton row count.
- Refactor (in this order — stop when scope feels right): FleetLoads table, DriverLoads table, Trucks, Trailers, CRM Brokers/Agents, Maintenance ServiceHistoryTab, Finance SettlementsTab.

## 5. Undoable Deletes Everywhere

We already have `useUndoableDelete`. Make it the default.

- Sweep all delete buttons in: Loads, Drivers, Trucks, Trailers, CRM contacts, Maintenance work orders / service history, Expenses, Documents, Templates.
- Pattern: optimistic remove → sonner toast with "Undo" action for 6s → on undo, restore; otherwise commit hard delete.
- Remove redundant confirm dialogs where undo replaces them. Keep confirm only for cascading/irreversible ops (delete org, delete user account).

## 6. Mobile Polish Sweep

- Audit every `Sheet`, `Dialog`, and primary form on `<sm` breakpoint.
- Ensure all primary action buttons are `h-12` and reachable above safe-area.
- Add `pb-[env(safe-area-inset-bottom)]` to sticky bottom bars.
- Sheets: ensure `flex flex-col` with scrollable middle so footer stays pinned (matches existing sheet memory).
- Hit-target sweep for table row actions (use a kebab menu instead of cramped inline icons on mobile).
- Convert long horizontal table scroll to a card-stack on `<md` for Loads and Maintenance lists.

## 7. Cross-cutting niceties

- Toast consistency: every mutation uses sonner with one of `loading → success/error` (promise form). Remove ad-hoc `toast.success` without error pairs.
- Disabled-state clarity: buttons show a tooltip explaining why they're disabled (blocked agency, demo mode, missing fields).
- Loading bars: standardize on a top-of-page progress hint via existing `LoadingBar` (no full-screen blockers on background refetches).
- Empty states: every list page gets an illustration-less but headline + helper + CTA empty state via `TableEmptyState`.

---

## Technical notes

- No DB / RLS / edge function changes.
- New shared code lives under `src/components/shared/` and `src/hooks/`.
- Recents + drafts + table prefs are all `localStorage` (per-user, per-org keyed). Cleared on logout via `AuthContext` sign-out (one-line addition).
- Quick-action event bus: pages that own a "+ New X" dialog add a single `useEffect` listener; no prop drilling.
- Command palette search uses existing tables/columns; no new indexes needed at this scale.
- Respect existing rules: no hardcoded colors, semantic tokens only, no DashboardLayout wrapping in pages, demo-mode guard on mutating quick actions.

## Out of scope

- Visual redesign / theming changes.
- New backend tables, migrations, or edge functions.
- Reworking the AgencyCRMStatusBadge flow shipped earlier.
- i18n.

## Rough sequencing

1. CommandPalette + recents + breadcrumbs (highest user-visible win).
2. Form primitives + autosave + shortcuts, applied to top 5 forms.
3. DataTable primitive + refactor FleetLoads first, then roll outward.
4. Undoable-delete sweep.
5. Mobile sweep + toast/disabled-state polish.
