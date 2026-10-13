---
version: 1
slug: "src-pages-executivedashboard-tsx"
primary_target: "src/pages/ExecutiveDashboard.tsx"
related_targets: ["src/pages/FleetLoads.tsx","src/pages/Finance.tsx","src/components/layout/DashboardLayout.tsx"]
---

# App shell, Today, Loads, Money

Scope: the authenticated app shell plus the owner's three phone jobs: Today (Executive Dashboard, `/executive-dashboard`), Loads (`/fleet-loads`), Money (`/finance`); and the shop: Shop (`/maintenance-home`) and Maintenance (`/maintenance`, tabs Work orders / PM schedule / Forecast / History / Inventory), which get their own phone tab set (Shop, Work orders, PM, Trucks, More). Visitor mode: Operate.

Audience and job: the JeanWay owner on his phone in a truck cab, day and night, checking what the business made, where loads stand, and this week's Landstar settlement. Secondary: the office user at a desk doing imports and edits.

Constraints: keep every route, feature, and data flow; React + Tailwind + shadcn; JeanWay JW logo kept; no flash, no SaaS-template KPI tiles, nothing cramped (44px touch targets). Hide multi-company SaaS scaffolding (beta modal, Discord banner, beta feedback widget, demo banner) from JeanWay.

## Direction contract

THESIS: The settlement week drawn the way drivers have always drawn their day: one ruled grid with loads as lines across it. Refuses the category default of a row of icon-bubble KPI cards over a chart.

OWN-WORLD: JeanWay brand palette (brand guide, user decision 2026-10-03, replacing the original logbook green): brand-black shell (header, phone tab bar, desktop rail) carrying the gold-and-white JW mark; white and warm-neutral page stock; dark gold #AC7524 (deepened for AA) for actions and links; gold #FFD34D marks the current item, today and selection, with light gold as its tint; brand gray #6D6E70 for secondary text; one hairline grid weight; red pen for problems, green only as a delivered-state signal. Dark theme: near-black page a step above the shell, gold for actions. Barlow for UI, Barlow Condensed for labels and figures, tabular numerals wherever money appears. 6px corners, no gradients, no glows.

STORY: Open the app, see this week's net and where every load sits in the Wed-Tue period, then tap into a load or the money lines. Trust comes from figures that add up visibly.

FIRST VIEWPORT: Phone: green header with JW mark, period label "Week ending Wed Oct 7" and the week's net in large condensed figures. Below, the logbook strip: 7 day columns, today highlighted in carbon yellow, each load a ruled segment from pickup day to delivery day labeled by trip number, status as a state mark. Then the money column: gross, Landstar share, deductions, net, right-aligned flush. Bottom tab bar: Today, Loads, Money, More.

FORM: The driver's paper logbook duty-status grid, candidate 6 of 7 on the grounded list; seed key 0db3af56. Raises kept: dense tabular numbers (Datamatics), one hairline weight and state-mark vocabulary (Centre-Rail), one family on a size ladder (Bitmap Specimen), right-aligned running totals (J-Card), trip number as load identity (Catalog Sleeve).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: tapping a load segment on the logbook strip selects it in carbon yellow and opens its detail; the strip scrolls horizontally by week with snap.

Motion grammar: state changes only; 150-200ms ease-out on selection and sheet open; nothing loops; reduced motion makes all of it instant.
