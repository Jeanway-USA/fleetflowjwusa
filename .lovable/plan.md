

## Plan: High-Converting Pricing Section on Homepage

### Overview
Replace the existing "Tiers Preview" section (lines 247-283) with a proper pricing section featuring three cards: Solo BCO and Fleet Owner as faded "Coming Soon" cards flanking a prominent center "Open Beta" card that's 100% free with a "Limited Time" badge.

### Changes — `src/pages/Landing.tsx`

**Replace lines 247-283** (the current Tiers Preview section) with:

**Section heading**: "Simple, Transparent Pricing" with subheading "Start free during our Open Beta. Premium tiers coming soon."

**Three-card grid** (`md:grid-cols-3`, items-center for vertical centering so the center card stands out):

1. **Solo BCO** (left) — faded style (`opacity-60`), "Coming Soon" badge at top
   - Price: "$49/mo" with strikethrough or muted
   - 4-5 key features (from existing TIERS data)
   - Disabled/muted button: "Coming Soon"
   - Subtle border, no glow

2. **Open Beta** (center, prominent) — full opacity, scaled up slightly (`md:scale-105`), gold border glow
   - "Limited Time" badge (gold, pill-shaped, top-right or above title)
   - Price: "$0" with "/forever during beta" subtitle
   - Icon: Truck
   - Features: All Solo BCO features + "Priority feature requests", "Early adopter perks"
   - CTA: "Start Free" button with `gradient-gold pulse-glow-gold` styling
   - Card has `border-primary/50` and subtle gold shadow

3. **Fleet Owner** (right) — faded style (`opacity-60`), "Coming Soon" badge
   - Price: "$149/mo" muted
   - 4-5 key features
   - Disabled/muted button: "Coming Soon"

**Below the cards**: "Compare All Features" link button to `/pricing` (kept from current)

### Badge component
Use the existing `Badge` import or inline a styled pill div for "Limited Time" and "Coming Soon" labels.

### Imports to add
- `Badge` from `@/components/ui/badge`
- `Star` or `Sparkles` from lucide-react (for the beta card icon, optional)

### No other files change

