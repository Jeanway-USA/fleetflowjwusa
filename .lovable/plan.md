

## Plan: Standardize Toast Notifications and Loading States

### Audit Summary

After thorough review, **most mutations already have proper toast notifications** via `onSuccess`/`onError` callbacks in their mutation hooks. The primary gaps are **submit buttons lacking loading/disabled states** to prevent double-clicks.

### Files Needing Changes

**1. `src/components/crm/ContactFormDialog.tsx`** — Add try/catch with error toast + use `LoadingButton`

- The `handleSubmit` has no try/catch — if the mutation throws, the user sees nothing
- Wrap the entire submit body in try/catch, add `toast.success` on close and `toast.error` in catch
- Replace the submit `<Button>` with `<LoadingButton loading={isLoading}>`

**2. `src/components/finance/SettlementsTab.tsx`** — Add loading state to submit button

- Line 744: Replace `<Button type="submit">` with `<LoadingButton loading={createMutation.isPending || updateMutation.isPending}>`
- Toasts already exist in mutation hooks

**3. `src/components/finance/PayrollTab.tsx`** — Add loading state to submit button

- Line 256: Replace `<Button type="submit">` with `<LoadingButton loading={createMutation.isPending || updateMutation.isPending}>`
- Toasts already exist

**4. `src/pages/AgencyLoads.tsx`** — Add loading state to submit button

- Line 285: Replace `<Button type="submit">` with `<LoadingButton loading={createMutation.isPending || updateMutation.isPending}>`
- Toasts already exist

**5. `src/pages/IFTA.tsx`** — Add loading state to fuel purchase submit button

- Line 1249: Replace `<Button type="submit">` with `<LoadingButton loading={createFuelMutation.isPending || updateFuelMutation.isPending}>`
- Toasts already exist

**6. `src/components/finance/CommissionsTab.tsx`** — Add loading state to submit button

- Line 223: Replace `<Button type="submit">` with `<LoadingButton loading={createMutation.isPending || updateMutation.isPending}>`
- Toasts already exist

**7. `src/components/settings/TeamManagementTab.tsx`** — Line 379: Add loading state to "Assign Role" button

- Currently no `disabled` state on the assign role submit button

### What's Already Working (No Changes Needed)

These files already have proper toasts AND loading states:
- `Trucks.tsx` — Uses `LoadingButton`
- `Trailers.tsx` — Uses `LoadingButton`  
- `Drivers.tsx` — Toasts in mutations
- `NewWorkOrderSheet.tsx` — Toasts + Loader2 icon
- `CompleteJobModal.tsx` — Toasts + uploading state
- `ExpensesList.tsx` — Toasts in mutations
- `DriverRequestForm.tsx` — Toasts + isSubmitting state
- `MaintenanceRequestForm.tsx` — Toasts in mutations
- `DVIRForm.tsx` — Toasts + disabled state
- `PreTripForm.tsx` / `PostTripForm.tsx` — Toasts + mutation pending
- `ProofOfDeliveryDialog.tsx` — Toasts + isSubmitting state
- `Incidents.tsx` — Toasts in mutations
- `RateConfirmationUpload.tsx` — Toasts + isProcessing state

### Implementation Details

Each fix follows the same pattern:
1. Import `LoadingButton` from `@/components/shared/LoadingButton`
2. Replace the plain `<Button type="submit">` with `<LoadingButton type="submit" loading={mutation.isPending}>`
3. For `ContactFormDialog`, add a try/catch wrapper and import `toast` from `sonner`

7 files modified, all small targeted changes (1-5 lines each).

