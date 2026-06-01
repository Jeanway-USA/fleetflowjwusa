## Force Re-Onboarding button

Add a destructive admin action inside the existing `DriverDetailSheet` that resets a driver's onboarding so they're locked back into `/driver/onboarding` on next load.

### Where it lives
In `src/components/drivers/DriverDetailSheet.tsx`, append a new "Danger zone" block under the existing "Signed Documents" section, inside the same `{canViewSignedDocs && …}` group (so only owner/payroll admins/safety with admin context see it). Gate the actual button to `isOwner || hasRole('payroll_admin')` to match who can manage driver records.

### UI
- Section heading: "Danger Zone" with an `AlertTriangle` icon.
- A short helper line explaining the consequence.
- `Button variant="outline"` with `border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground`, label "Force Re-Onboarding", icon `RotateCcw`.
- Disabled (with spinner) while the mutation runs; hidden when `driver.user_id` is null (no account yet, so nothing to lock out) and replaced with a muted note.

### Confirmation
Use `AlertDialog` (shadcn). Title: "Force re-onboarding?". Description: "Are you sure? This will lock the driver out of their dashboard until they re-sign all documents for this organization." Cancel + destructive Continue button.

### Mutation (sequential, fail-fast)
On confirm, run a single TanStack `useMutation` that performs three Supabase calls in order using `driver.user_id` / `driver.id` / `driver.org_id`:

1. `profiles` — `update({ onboarding_completed: false }).eq('user_id', driver.user_id)`
2. `driver_signed_documents` — `delete().eq('driver_id', driver.id).eq('org_id', driver.org_id)` (RLS lets owner/payroll see them; deletion will go through a new policy — see Schema note below)
3. `drivers` — `update({ direct_deposit_attachment_url: null }).eq('id', driver.id)`

Throw on the first error so the toast reflects the failing step. On success show `toast.success('Driver onboarding has been reset.')` and invalidate the `['drivers']` and `['signed-documents', driver.id]` query caches.

### Schema note (one migration)
`driver_signed_documents` currently has SELECT/INSERT policies only — admins cannot DELETE. Add one policy in a new migration:

```sql
CREATE POLICY "Owner payroll can delete signed documents"
ON public.driver_signed_documents
FOR DELETE
TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
       AND org_id = get_user_org_id(auth.uid()));
```

(No table-structure change, no new columns; the existing GRANTs already include DELETE for `authenticated`.)

### Out of scope
- Audit log entry (could be added later via existing `audit_logs` table).
- Removing stored files from storage buckets — only the DB pointers are cleared per the user's spec.
- Notifying the driver via email.

### Files
- New: `supabase/migrations/<timestamp>_driver_signed_docs_delete_policy.sql`
- Edit: `src/components/drivers/DriverDetailSheet.tsx` (add Danger Zone block + AlertDialog + mutation)