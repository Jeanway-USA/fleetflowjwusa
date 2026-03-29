

## Plan: Replace Text Branding with Logo Images

### Overview
Replace all instances of the text-based "Fleet Flow TMS / by JeanWayUSA" branding with the uploaded logo images. Use the icon logo (Logo.png) for compact spaces (sidebar, nav headers) and the text logo (Text_Logo.png) for larger branding areas (hero, footer, auth pages).

---

### Assets
- Copy `Logo.png` → `src/assets/Logo.png` (square icon — sidebar, nav)
- Copy `Text_Logo.png` → `src/assets/Text_Logo.png` (wide text logo — hero, footer, auth)

### Files to Update

| File | Change |
|------|--------|
| `src/pages/Landing.tsx` | Nav header: icon logo + text logo. Footer brand: text logo. CTA section text reference stays as-is. |
| `src/components/layout/AppSidebar.tsx` | Replace text branding block with icon logo (small) or text logo (expanded sidebar). |
| `src/pages/Auth.tsx` | Replace heading text with text logo image. |
| `src/pages/ResetPassword.tsx` | Replace 3 heading instances with text logo. |
| `src/pages/Onboarding.tsx` | Replace heading with text logo. |
| `src/pages/PendingAccess.tsx` | Replace heading with text logo. |
| `src/pages/Pricing.tsx` | Nav and footer — icon + text logo. |
| `src/pages/CheckoutSuccess.tsx` | Minor text reference, keep as plain text (contextual sentence). |

### Approach
- Import logos as ES6 modules (`import logo from "@/assets/Logo.png"`).
- Icon logo renders at ~32–40px height in nav/sidebar contexts.
- Text logo renders at ~160–200px width in hero/auth/footer contexts.
- Add `alt="FleetFlow TMS by JeanWay USA"` for accessibility.
- The text logo is white, so it works on dark backgrounds. For light theme compatibility, add `dark:invert-0 invert` class or rely on the app's dark-first design.

