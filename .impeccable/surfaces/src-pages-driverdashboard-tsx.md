---
version: 1
slug: "src-pages-driverdashboard-tsx"
primary_target: "src/pages/DriverDashboard.tsx"
related_targets: ["src/pages/DriverLoads.tsx","src/pages/DriverSettlements.tsx","src/pages/DriverStats.tsx","src/pages/DriverSettings.tsx","src/components/driver/ui/driver-ui.tsx"]
---

# Driver app (all driver screens)

Mode: Operate. Phone first, in a truck cab, daylight and night, weak signal. Whole driver app: Home, My Loads, My Pay (settlements), My Stats, Settings, and every dialog. The offline setup is kept (query cache, offline action queue, document queue) and extended with a saved copy of the driver's data on the phone.

Owner decisions, in his words: the current load first; a modern phone app, friendly but serious, cards allowed but made well; light or dark at the driver's choice; not the round, bubbly look of the Shop redesign, and not a paper or ledger look (the first attempt, a strict ruled grid, was rejected). Chosen from two mockups: option A's structure (greeting, one strong load card, quick-action tiles, pay, equipment and location cards) with option B's vertical stops timeline inside the load card.

## Direction contract

THESIS: One strong card runs the trip, and everything else is a quiet card on a soft page. The next stop is the biggest thing on screen and the gold button under it is the one thing to do. It refuses the dashboard of equal-weight widgets and the ruled-ledger look that was tried and dropped.

OWN-WORLD: JeanWay brand palette through the existing tokens: warm off-white page with white cards in light, near-black page with raised dark cards in dark; gold (#FFD34D, the carbon token) only for the next stop marker and the main action; brand gray for secondary text; functional green and red for status. Barlow Condensed for the next stop and big figures, Barlow for everything else, tabular numerals. Cards 12px, buttons 10px, hairline borders, no shadows, no gradients, no pills.

STORY: A driver opens the app and knows where the next stop is, when, and what to tap. Stops read top to bottom as a timeline: green behind, one gold dot ahead, hollow after. Pay, equipment, location, requests and the leaderboard follow, each in the same card.

FIRST VIEWPORT: Phone, 390px. Date and greeting with refresh and bell. The load card: load number and status chip, "Pick up at" or "Deliver to", the place at 36px condensed, address and appointment, the pickup-number box when heading to pickup, the stops timeline, miles and estimated pay, and the full-width gold action button. Four quick-action tiles under it (Scan, Details, Map, Issue). Then pay this week.

FORM: Modern phone app, the owner's own mix of two mockups (option A structure, option B timeline), after the Motor Carriers' Atlas direction (seed f18c4cab, candidate 5) was built and rejected by the owner as too paper-like and too strict. A user-pinned direction beats the roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
