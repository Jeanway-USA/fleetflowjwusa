

## Plan: Mobile-Optimize Landing Page

### Overview
Three changes: (1) hamburger menu for mobile nav, (2) mobile responsiveness audit across all sections, (3) sticky bottom CTA banner on mobile.

### Changes — `src/pages/Landing.tsx`

**1. Mobile hamburger menu (lines 72-86)**
- Add `menuOpen` state
- Desktop nav buttons get `hidden sm:flex`
- Add a hamburger button (`Menu` icon) visible only on mobile (`sm:hidden`)
- Use the existing `Sheet` component (slide from right) containing Pricing, Sign In, Start Free Trial links
- Import `Menu` from lucide-react, `Sheet`/`SheetContent`/`SheetTrigger` from ui/sheet

**2. Responsiveness fixes throughout**
- Hero heading: reduce to `text-3xl` on mobile (currently `text-4xl`)
- Hero padding: `py-12 sm:py-20 lg:py-28`
- Hero subheadline: `text-base sm:text-lg`
- Four Pillars section: reduce padding `p-5 sm:p-8`, section padding `py-12 sm:py-20`
- Tiers section: `py-12 sm:py-20`
- CTA section: `p-6 sm:p-12`, `py-12 sm:py-20`, heading `text-2xl sm:text-3xl`
- Stats: `py-8 sm:py-12`, values `text-2xl sm:text-3xl`
- Add `pb-20 sm:pb-0` to the page container to account for sticky bottom banner

**3. Sticky mobile CTA banner**
- Fixed to bottom, `sm:hidden`, with "Join BCO Beta" button spanning full width
- Semi-transparent background with backdrop blur, top border
- Rendered as last element before closing `</div>`

### No other files change
All changes are contained within `Landing.tsx` using existing Sheet component and Tailwind responsive utilities.

