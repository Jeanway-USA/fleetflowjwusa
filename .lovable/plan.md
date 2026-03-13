

## Plan: Add MVR Expiry Field to Driver Profiles

### Problem
The `mvr_expiry` column exists in the `drivers` database table and is displayed in the Safety page's Driver Compliance Hub, but there is no way to actually set or edit this date — it's missing from:
1. The driver add/edit form dialog
2. The driver profile card display

### Changes (`src/pages/Drivers.tsx`)

1. **Add MVR Expiry date input to the driver form** — Place it in the credentials section alongside License Expiry and Medical Card Expiry (around line 488, after the medical_card_expiry input). Simple date input field labeled "Annual MVR Expiry".

2. **Display MVR Expiry on driver profile cards** — Add a row between Medical Card and HAZMAT (around line 371) showing the MVR expiry date with expiration highlighting, similar to the existing License and Medical Card rows.

No database changes needed — `mvr_expiry` already exists on the `drivers` table.

### Files
- `src/pages/Drivers.tsx`

