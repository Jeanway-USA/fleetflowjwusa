# Fix CRM "Failed to save contact / Cannot coerce…" error

## What's happening

That exact PostgREST message is thrown by `.single()` when the query returns 0 rows. Every CRM mutation in `src/hooks/useCRMData.ts` uses `.insert(...).select().single()` / `.update(...).select().single()`, so any one of these will surface as "Failed to save contact" in the UI:

1. **INSERT returns 0 rows under RLS** — Postgres inserts the row, but the `RETURNING` step is filtered by the SELECT policy. If `org_id` on the payload doesn't match the user's org (or the user briefly has no org context), the row is hidden and `.single()` blows up even though the write succeeded. This is the most common cause on live.
2. **UPDATE matches 0 rows** — for example editing a record whose `id` no longer exists in `crm_contacts` (it was migrated to `company_resources`, or another tab/user deleted it). `.single()` errors instead of giving a clean message.
3. **Trigger side-effects** — the auto-harvest trigger on `fleet_loads` writes to `crm_contacts`, but a trigger on `crm_contacts` itself that changes/removes the row would also empty the `RETURNING` set. Worth a quick look while we're in there.

The user only sees a red toast with no recovery, and we don't actually know whether the write landed.

## Fix (frontend only)

In `src/hooks/useCRMData.ts`, replace `.single()` with `.maybeSingle()` for all six CRM-related mutations (`createContact`, `updateContact`, `createResource`, plus the matching facility/resource create mutations on lines 196, 216, 273, 346, 467) and handle the null case explicitly:

- On INSERT: if `data` is null, re-fetch by the inserted payload's natural key (or just invalidate and trust the write) and show a soft warning instead of an error. Don't throw — the row was written.
- On UPDATE: if `data` is null, throw a clear error: "This contact no longer exists or you don't have permission to edit it" so the toast actually tells the user what went wrong.

Also tighten `ContactFormDialog.handleSubmit`:

- Guard against missing `orgId` before calling any mutation (toast + return). Right now if `orgId` is briefly undefined we send `org_id: undefined` and RLS hides the row.
- Trim/normalize empty strings to `null` before insert so policies / unique constraints behave consistently.

## Verify

- Add a CRM contact of each type (broker, agent, shipper/receiver, maintenance shop) — no red toast, row appears in table.
- Edit each type — saves cleanly; if the row was deleted in another tab, you now get the "no longer exists" message instead of the coerce error.
- Confirm on the live preview by reproducing the original flow that triggered the screenshot.

## Files touched

- `src/hooks/useCRMData.ts` — switch `.single()` → `.maybeSingle()` in the 5 mutations, handle null.
- `src/components/crm/ContactFormDialog.tsx` — `orgId` guard + null-empties normalization in `handleSubmit`.

No DB migration, no schema change, no edits to RLS or triggers in this pass. If after deploy we still see the toast, next step is to inspect the `crm_contacts` SELECT policy and the auto-harvest trigger.
