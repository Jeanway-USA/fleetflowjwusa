

## Plan: Update Bottom CTA Section to Match Open Beta Style

### Change: `src/pages/Landing.tsx` (lines 399–416)

Update the bottom CTA section to match the open beta branding used elsewhere on the landing page:

- **Headline**: Change to "Join the Open Beta" (or similar beta-focused copy)
- **Body text**: Update to reference the open beta instead of a free trial — e.g. "Be among the first Landstar BCOs to experience Fleet Flow TMS. Full platform access, zero cost during the beta period."
- **Button text**: Change from "Start Your 14-Day Free Trial" to "Join BCO Beta" with the `pulse-glow-gold` animation class used by the hero CTA
- **Subtext**: Replace "No credit card required" with something like "Free during Open Beta · No credit card required"
- **Container styling**: Keep the existing rounded card but can add a subtle radial gradient or slightly stronger border glow to match the premium dark aesthetic used in other sections

Single file edit, ~15 lines changed.

