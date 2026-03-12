

## Plan: Premium Footer + Scroll Animations + Micro-interactions

### 1. Premium Multi-Column Footer (replace lines 413-422)

Replace the minimal two-line footer with a structured SaaS footer:

**Top row**: Brand name + tagline on left, three columns on right:
- **Product**: Loads, IFTA, Maintenance, Dispatch, Driver App (all link to `/auth`)
- **Company**: Pricing (`/pricing`), About, Contact (placeholder `#` for now)
- **Legal**: Privacy Policy, Terms of Service (placeholder `#`)

**Bottom row**: Separator, then copyright + "Built for Landstar BCOs" tagline.

Styled with `bg-[hsl(240_20%_4%)]` dark background, muted link colors with hover transitions.

### 2. Scroll-Triggered Fade-In Animations

Create a small `useScrollReveal` hook or inline `IntersectionObserver` logic via a reusable wrapper component `<RevealOnScroll>` that:
- Wraps each major section (Stats, Pricing, Pillars, CTA)
- Starts children as `opacity-0 translate-y-6`
- On intersection (`threshold: 0.15`), applies `opacity-100 translate-y-0` with CSS transition
- Uses `once: true` so animation only fires once

This will be a small component in a new file `src/components/shared/RevealOnScroll.tsx`.

### 3. Button & Interactive Micro-interactions

Add to all `Button` elements on the page:
- `active:scale-[0.97]` for press feedback on click/tap
- Ensure all buttons already have `transition-transform` (add where missing)
- Feature cards in the Pillars section: add `transition-shadow` alongside existing hover translate

### Files to edit
- `src/components/shared/RevealOnScroll.tsx` (new — ~20 lines)
- `src/pages/Landing.tsx` (footer replacement, wrap sections in `<RevealOnScroll>`, add active states to buttons)

