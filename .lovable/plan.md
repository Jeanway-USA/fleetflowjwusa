

## Plan: Redesign Landing Page Hero Section

### Overview
Replace the current centered-text hero with a modern two-column layout featuring a dark gradient background, updated copy, a floating dashboard mockup on the right, and a pulsing/glowing CTA button.

### Changes (1 file)

**`src/pages/Landing.tsx`** — Replace the Hero section (lines 89-131):

1. **Background**: Dark gradient with subtle dot pattern overlay using CSS pseudo-elements via inline styles and tailwind classes (`bg-[#0a0a0f]` with radial gradient overlay)

2. **Layout**: Two-column grid (`lg:grid-cols-2`) — left side has text content, right side has the dashboard mockup

3. **Left column**:
   - Keep the "Built for Landstar BCOs & Agents" badge
   - Headline: `Master Your Fleet's Finances & Dispatch.` with gold gradient on key words
   - Subheadline: `The all-in-one platform built specifically for Landstar BCOs to track expenses, manage card advances, and streamline dispatching.`
   - CTA: "Join Free BCO Beta" with `ArrowRight` icon, pulsing glow animation
   - Keep the "Try Demo" button as secondary

4. **Right column — Floating dashboard mockup**:
   - A stylized card with a fake dashboard UI (mini stat cards, a chart placeholder, sidebar hint) built with divs/CSS
   - Perspective transform (`rotate-y`, `rotate-x`) for a 3D floating effect
   - Subtle shadow and border glow in gold
   - Floating animation via CSS keyframe (`animate-float`)

5. **CTA button animation**: Add a `@keyframes pulse-glow` animation in the component using Tailwind's `animate-` utility plus a custom class that pulses the `box-shadow` on the gold button. On hover, intensify the glow.

**`src/index.css`** — Add two new utility animations:
- `animate-float`: gentle up/down float (translateY 0 → -10px → 0, 6s infinite)
- `pulse-glow-gold`: pulsing box-shadow on the CTA (2s infinite)

### Dashboard Mockup (pure CSS/JSX)
A card containing:
- A mini sidebar strip (dark with 4-5 icon dots)
- A top bar with fake search input
- 3 small KPI cards (Revenue, Loads, Miles) with placeholder numbers
- A faux chart area (gradient bar or simple SVG line)
- All in muted dark colors with gold accent highlights

This avoids needing an image asset — it's a self-contained JSX component that looks like a real dashboard screenshot.

### No other sections change
The rest of the page (Stats, Tiers, Features, CTA, Footer) remains untouched.

