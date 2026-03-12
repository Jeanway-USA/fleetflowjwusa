

## Plan: Replace Feature Highlights with 4-Pillar BCO Capability Cards

### Overview
Replace the 6 generic feature cards (lines 267-288) with 4 focused, visually distinct pillar cards for Landstar BCOs. Each card gets a unique accent color, a relevant icon, a title, a description, and a hover effect that lifts the card with a soft shadow.

### Changes — `src/pages/Landing.tsx`

**Replace the Feature Highlights section** (lines 267-288) with:

- Section heading: "Built for the Way You Work" with a subheading
- A `grid-cols-1 sm:grid-cols-2` layout (4 cards, 2x2 on desktop)
- Each card has:
  - A colored icon container (unique accent per pillar)
  - Title + 2-line description
  - Hover: `hover:-translate-y-1 hover:shadow-lg` transition
- Four pillars:
  1. **Automated Statement Parsing** (FileText icon, gold accent) — "Upload your Landstar settlement PDF and watch it auto-map every line item..."
  2. **Fuel & Card Advance Tracking** (Fuel icon, emerald accent) — "Track fuel purchases, Comdata advances, and per-load expenses..."
  3. **Active Load Dispatching** (Package icon, blue accent) — "Assign drivers, update statuses, and monitor pickups & deliveries..."
  4. **Driver Mobile Access** (Smartphone icon, purple accent) — "Drivers get their own dashboard for BOL uploads, DVIR forms..."

**Import addition**: Add `Smartphone` from `lucide-react`.

### No other files change
The CSS already has the needed transition utilities via Tailwind.

