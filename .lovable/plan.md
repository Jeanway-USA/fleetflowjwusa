
# Site-Wide Soft Delete + Archive System

## 1. Database Migration

Add `deleted_at timestamptz NULL` and `archived_by uuid NULL` to these tables (skip `is_archived` — use `deleted_at IS NOT NULL` as the canonical archived state; single source of truth avoids drift):

**Core:** `drivers`, `trucks`, `trailers`, `fleet_loads`, `agency_loads`, `crm_contacts`, `facilities`, `parts_inventory`, `truck_stops`, `company_resources`, `document_templates`

**Financial working data:** `expenses`, `fuel_purchases`, `maintenance_requests`, `work_orders`, `incidents`, `detention_requests`, `driver_requests`

**Explicitly skipped (audit/immutable):** `audit_logs`, `load_status_logs`, `driver_signed_documents`, `document_instances`, `document_signatures`, `settlements`, `driver_settlements`, `driver_payroll`, `internal_payroll_ledger`, `agent_commissions`, `general_ledger`, `tax_*`, `safety_bonus_payouts`, `truist_payout_logs`, `driver_notifications`, `driver_locations`, `messages`, `changelog`, `user_feedback`.

Migration also adds:
- Partial index `WHERE deleted_at IS NOT NULL` on each table for fast Archive queries.
- Index `WHERE deleted_at IS NULL` on hot tables (`fleet_loads`, `drivers`, `trucks`) for active-list queries.
- RLS policies remain — active reads add `deleted_at IS NULL` filter at the app layer (not RLS) so restore paths can still fetch archived rows.
- New RPC `archive_record(_table text, _id uuid)` and `restore_record(_table text, _id uuid)` — SECURITY DEFINER, validates table name from allow-list, enforces `has_archive_access(_user, _table)` role gating, stamps `deleted_at`/`archived_by`.
- New RPC `has_archive_access(_user_id uuid, _table text)` returning boolean, role-scoped:

  | Table group | Allowed roles |
  |---|---|
  | drivers, driver_requests | owner, payroll_admin |
  | trucks, trailers, parts_inventory, maintenance_requests, work_orders | owner, maintenance, dispatcher |
  | fleet_loads, agency_loads, facilities, truck_stops, detention_requests | owner, dispatcher |
  | crm_contacts, company_resources, document_templates | owner, dispatcher |
  | expenses, fuel_purchases | owner, payroll_admin |
  | incidents | owner, safety |

## 2. Global Data Layer

- New helper `src/lib/soft-delete.ts` exporting:
  - `activeFilter(query)` → applies `.is('deleted_at', null)`
  - `useSoftDelete(table)` hook returning `{ archive, restore, purge }` mutations, each wired to `useUndoableDelete` (10s toast timeout).
- Sweep all `supabase.from(<table>).select(...)` reads in `src/pages/**`, `src/components/**`, `src/hooks/**` for the tables above and add `.is('deleted_at', null)` **except**:
  - Archive page queries (fetch `deleted_at IS NOT NULL`)
  - Historical/audit contexts already reading finalized snapshots
  - Foreign-key joins where hiding parent would orphan child rows (e.g. showing an active load whose driver was archived — display driver name with "(archived)" suffix).
- Update TanStack Query keys — no key changes; invalidations already broad.

## 3. UI Behavior

- Replace every "Delete" label/icon on the covered entities with **"Archive"** (button text, dropdown items, tooltips, confirm-dialog titles). Icon changes from `Trash2` to `Archive`.
- New `ConfirmArchiveDialog` component (fork of `ConfirmDeleteDialog`) with copy: "Archive this X? You can restore it from the Archive page within 30 days."
- Archive action wired through `useUndoableDelete` (already exists) with **10s** toast + Undo button that calls `restore_record` RPC.
- **Active-association warnings** — before archive, run a quick count query. Examples:
  - Driver: active loads count (`fleet_loads.driver_id = X AND status IN ('booked','in_transit','at_pickup','at_delivery')`)
  - Truck: active loads + open work orders
  - Trailer: active assignments
  - CRM contact: active loads referencing broker
  If count > 0, dialog shows red-tinted warning listing associations, still allows archive (doesn't block).

**Files touched (delete → archive rename):** `Drivers.tsx`, `Trucks.tsx`, `Trailers.tsx`, `FleetLoads.tsx`, `AgencyLoads.tsx`, `CRM.tsx`, `Incidents.tsx`, `MaintenanceManagement.tsx`, `Documents.tsx`, `IFTA.tsx`, plus dropdowns in `OrgActionsDropdown`, detail sheets (`DriverDetailSheet`, `ContactDetailSheet`, etc.), and bulk-action bars in `DataTable` consumers.

## 4. Archive/Trash Page

New route `/archive` → `src/pages/Archive.tsx`, added to sidebar under "Admin" section (only visible when the user has archive access to at least one entity type).

Layout:
```text
+-------------------------------------------------+
| Archive                          [Search input] |
+-------------------------------------------------+
| Tabs: Drivers | Trucks | Loads | CRM | ... (role-gated) |
+-------------------------------------------------+
| [x] | Name | Archived | By | Actions            |
| [x] | ...  | 2d ago   | JD | Restore  Delete    |
+-------------------------------------------------+
| Bulk: [Restore selected] [Permanently delete]   |
+-------------------------------------------------+
```

- Tabs render only for entity types the current user can access (`has_archive_access`).
- Each tab uses `DataTable` with `deleted_at IS NOT NULL` filter, columns per entity, search input filters current tab.
- Row actions: **Restore** (calls `restore_record`) and **Permanently Delete** (uses existing `ConfirmDeleteDialog` — single confirmation, hard `DELETE FROM ...`).
- Bulk actions in existing `DataTable` bulk bar.
- 30-day retention hint in header — no auto-purge job in this pass (can add later).

## 5. Permissions & RBAC

- Sidebar link visibility gated by a new `useArchiveAccess()` hook that checks the user's roles against the table→role map above.
- Server-side enforcement lives entirely in `archive_record`/`restore_record`/hard-delete RPCs — client checks are UX only.
- Hard delete permission = same as archive permission for that table (owner has it for all).

## Out of scope

- Auto-purge cron after 30 days
- Restoring cascaded children (archiving a driver doesn't archive their loads; loads keep the driver_id and show "(archived)")
- Bulk export of archived data
- Archive of tables not listed in section 1

## Technical Notes

- All RLS policies for covered tables need re-review to ensure they don't block updates when `deleted_at` is set. Since existing policies check `org_id`/role and not `deleted_at`, no policy changes required — verified against schema.
- The `has_archive_access` function is `STABLE SECURITY DEFINER` with `search_path=public`, same pattern as `has_role`.
- Undo restores by clearing `deleted_at` and `archived_by`. No history table needed; the columns themselves are the history.
- New types will regenerate after migration approval.
