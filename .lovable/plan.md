## Add a refresh action to the banking card

Add a small **Refresh** icon button in the `DriverBankingDetails` header (next to Edit / Reveal). On click it invalidates the three queries the card relies on so any banking the driver already submitted (or that an admin saved in another tab) appears immediately — no page reload, no re-onboarding.

### Behavior

- Button shows a spinning icon while refetching.
- Invalidates: `driver_banking_meta`, `driver_banking`, `driver_dd_attachment` (all scoped to the current `driverId`).
- Visible in both the "no info yet" empty state and the populated card, so an admin who just had the driver complete onboarding can pull the new record without leaving the profile.
- Available to owners and payroll admins only (same gate as the rest of the card).

### File touched

- `src/components/drivers/DriverBankingDetails.tsx` — add a `RefreshCcw` button + handler that calls `queryClient.invalidateQueries` for the three keys and toasts "Refreshed".

No DB, RLS, or onboarding-flow changes.
