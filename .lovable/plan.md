## Remove Issue button from My Requests widget

In `src/components/driver/DriverRequestsCard.tsx`:
- Drop `'maintenance'` from the quick-action grid array and change grid from `grid-cols-4` to `grid-cols-3`.
- Keep `maintenance` entry in `TYPE_META` so legacy maintenance requests in history still render correctly with the Wrench icon/label.

Also in `src/components/driver/DriverRequestForm.tsx`:
- Remove the `'maintenance' / Report Issue` option from the request-type selector so users can't manually pick it through the "New" button either.

Maintenance reporting remains available via the Maintenance Requests card directly below.