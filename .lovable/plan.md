

# Separate MC Number and DOT Number Fields

## Change

Split the single "MC / DOT Number" input in Step 1 of the onboarding wizard into two distinct fields:

- **MC Number** (optional) -- placeholder: "MC-123456"
- **DOT Number** (optional) -- placeholder: "1234567"

## Technical Details

### File: `src/pages/Onboarding.tsx`

1. Replace the single `mcNumber` state variable with two: `mcNumber` and `dotNumber`.
2. Replace the single input field with a side-by-side grid (`grid-cols-1 sm:grid-cols-2`) containing both fields.
3. No database changes needed -- these values are not currently persisted (the `organizations` table doesn't have MC/DOT columns). The state variables exist for future use.

