---
version: 1
slug: "src-pages-executivedashboard-tsx"
primary_target: "src/pages/ExecutiveDashboard.tsx"
related_targets: ["src/pages/FleetLoads.tsx","src/pages/Finance.tsx","src/components/layout/DashboardLayout.tsx"]
---

# App shell, Today, Loads, Money

Scope: the authenticated app shell plus the owner's three phone jobs: Today (Executive Dashboard, `/executive-dashboard`), Loads (`/fleet-loads`), Money (`/finance`). Visitor mode: Operate.

Audience and job: the JeanWay owner on his phone in a truck cab, day and night, checking what the business made, where loads stand, and this week's Landstar settlement. Secondary: the office user at a desk doing imports and edits.

Constraints: keep every route, feature, and data flow; React + Tailwind + shadcn; JeanWay JW logo kept; no flash, no SaaS-template KPI tiles, nothing cramped (44px touch targets). Hide multi-company SaaS scaffolding (beta modal, Discord banner, beta feedback widget, demo banner) from JeanWay.

## Direction contract

THESIS: The settlement week drawn the way drivers have always drawn their day: one ruled grid with loads as lines across it. Refuses the category default of a row of icon-bubble KPI cards over a chart.

OWN-WORLD: Deep logbook-green shell (header, bottom tab bar, desktop rail) over cool white stock; grid ink green hairlines at one weight; carbon-copy yellow marks the current item and selection; red-pen marks problems. Barlow for UI, Barlow Condensed for labels and figures, tabular numerals everywhere money appears. Square-ish 6px corners, no shadows beyond one tint, no gradients, no glows.

STORY: Open the app, see this week's net and where every load sits in the Wed-Tue period, then tap into a load or the money lines. Trust comes from figures that add up visibly.

FIRST VIEWPORT: Phone: green header with JW mark, period label "Week ending Wed Oct 7" and the week's net in large condensed figures. Below, the logbook strip: 7 day columns, today highlighted in carbon yellow, each load a ruled segment from pickup day to delivery day labeled by trip number, status as a state mark. Then the money column: gross, Landstar share, deductions, net, right-aligned flush. Bottom tab bar: Today, Loads, Money, More.

FORM: The driver's paper logbook duty-status grid, candidate 6 of 7 on the grounded list; seed key 0db3af56. Raises kept: dense tabular numbers (Datamatics), one hairline weight and state-mark vocabulary (Centre-Rail), one family on a size ladder (Bitmap Specimen), right-aligned running totals (J-Card), trip number as load identity (Catalog Sleeve).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: tapping a load segment on the logbook strip selects it in carbon yellow and opens its detail; the strip scrolls horizontally by week with snap.

Motion grammar: state changes only; 150-200ms ease-out on selection and sheet open; nothing loops; reduced motion makes all of it instant.
