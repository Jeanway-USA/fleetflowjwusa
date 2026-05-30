## Plan: Add clickable phone number to driver profile card

### Scope
Update `src/pages/Drivers.tsx` to display the driver's phone number prominently with a clickable `tel:` link in the driver card header area.

### Analysis
- The Supabase query already fetches `*` from `drivers`, so the `phone` field is already included — no query change needed.
- `ContactDetailSheet.tsx` is used only in `src/pages/CRM.tsx` (for broker/shipper contacts), not for driver profiles. It already has `tel:` links. No changes required there.

### Changes

1. **`src/pages/Drivers.tsx`** — Move and enhance the phone display:
   - In the card header area (near the driver's name/status), add a prominent phone number row with a `tel:` anchor tag.
   - Keep the existing phone display in CardContent as a secondary fallback, or remove it to avoid duplication.
   - The link format: `<a href="tel:${driver.phone}">` so dispatchers can tap-to-call from mobile devices.

### Acceptance Criteria
- Phone number appears near the driver's name in the card header.
- Phone number is wrapped in a clickable `tel:` anchor tag.
- Existing card layout and other fields remain unchanged.
- No database or query changes needed (column already fetched via `*`).