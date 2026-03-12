

## Plan: Redesign Auth Page with Beta Benefits Panel

### Layout

Replace the current centered single-card layout with a **split-screen** design:
- **Desktop (lg+)**: Two-column grid — left panel (Beta Benefits) + right panel (Sign-up/Sign-in card)
- **Mobile**: Stacked vertically — Benefits panel on top (condensed), form card below

### Left Panel — Beta Benefits (dark/gradient background)

A visually rich panel with:
- Brand logo + "Fleet Flow TMS" heading
- "Open Beta" badge (gold)
- Three benefit items with icons:
  - `Sparkles` — "100% Free Access During Beta"
  - `MessageSquare` — "Shape the Future of the Platform"  
  - `Truck` — "Built Exclusively for Landstar BCOs"
- Each benefit: icon + title + short description
- Subtle decorative gradient or pattern background
- "Back to Home" link at bottom of this panel

### Right Panel — Auth Card

- Default tab set to **"signup"** (prioritize sign-up)
- Sign Up form: First Name, Last Name, Email, Password fields
- Primary CTA: **"Create Free Beta Account"** with `gradient-gold` styling and `active:scale-[0.97]`
- Sign In tab remains as-is with minor styling alignment
- All inputs use the existing `h-12` mobile-friendly sizing

### Forgot Password View

Keep functional but update wrapper to match the new split-screen layout (centered card, no benefits panel needed).

### Files to edit
- `src/pages/Auth.tsx` — Full layout redesign, add icons import (`Sparkles`, `Truck`, `MessageSquare`), change default tab to signup

