

## Fix: Rapid Call Modal Address Overflow

The long origin/destination addresses are rendering on a single line and overflowing horizontally, even at `sm:max-w-lg`.

### Changes

**File: `src/components/dispatcher/RapidCallModal.tsx`**

1. Widen the dialog further to `sm:max-w-2xl` (672px) to fit full addresses
2. Change the origin/destination layout from a single inline row to a stacked (vertical) layout so long addresses wrap naturally instead of overflowing
3. Add `break-all` or `break-words` to address text to handle edge cases

This ensures the modal content fits comfortably regardless of address length.

