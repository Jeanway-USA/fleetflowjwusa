

## Plan: Standardize Touch Targets & Prevent iOS Auto-Zoom

Four files need updates. All changes are CSS-only in Tailwind classes.

### 1. `src/components/ui/input.tsx` (line 11)
Current: `h-11 sm:h-10`, `text-base`, `md:text-sm`, `px-3 py-2`
Changes:
- Height: `h-12 sm:h-10` (48px mobile → 40px desktop)
- Font: already `text-base md:text-sm` — change breakpoint to `sm:text-sm` for consistency
- Padding: `px-4 py-3 sm:px-3 sm:py-2`

### 2. `src/components/ui/select.tsx` — SelectTrigger (line 20)
Current: `h-10`, `text-sm`, `px-3 py-2`
Changes:
- Height: `h-12 sm:h-10`
- Font: `text-base sm:text-sm` (prevents iOS zoom)
- Padding: `px-4 py-3 sm:px-3 sm:py-2`

### 3. `src/components/ui/textarea.tsx` (line 11)
Current: `text-sm`, `px-3 py-2`
Changes:
- Font: `text-base sm:text-sm`
- Padding: `px-4 py-3 sm:px-3 sm:py-2`

### 4. `src/components/ui/button.tsx` (line 20)
Current default size: `h-11 sm:h-10 px-4 py-2`
Changes:
- Height: `h-12 sm:h-10` (48px mobile)
- Padding: `px-4 py-3 sm:py-2`

