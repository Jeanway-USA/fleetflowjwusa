## Plan: Rewrite Driver Dashboard Product Tour

### Overview
Replace the existing `driverTour` in `src/lib/tour-steps.ts` with a comprehensive 7-step walkthrough targeting the IDs added to `DriverDashboard.tsx`. Ensure no DVIR/Pre-Trip/Post-Trip references remain.

### Changes

#### 1. `src/lib/tour-steps.ts` — Rewrite `driverTour`
Replace the existing 2-step `driverTour` with the following 7 steps:

| Step | `targetSelector` | Title | Description |
|------|------------------|-------|-------------|
| 1 | `'body'` | Welcome to FleetFlow! | You're all set! This dashboard is your central hub for everything you need on the road. Let's take a quick tour of how to use it. |
| 2 | `'#tour-active-load'` | Your Current Dispatch | Here is your active load. You can view pickup/delivery times, routing details, and update your status (like Arrived or Loaded) right from this card. |
| 3 | `'#tour-document-scan'` | Instant Document Upload | No more waiting to turn in paperwork. Use this to instantly scan and upload BOLs, weight tickets, or lumper receipts using your phone's camera. Getting paperwork in faster means getting paid faster! |
| 4 | `'#tour-safety-bonus'` | Track Your Bonus | Drive safe, earn more. This widget tracks your safe miles in real-time for the current 4-week period. Watch your bonus grow as you complete loads without incidents. |
| 5 | `'#tour-pay-widget'` | Your Earnings | Transparency is key. Track your current weekly settlements, year-to-date earnings, and view detailed pay stubs directly from this panel. |
| 6 | `'#tour-driver-requests'` | Support & Requests | Need a cash advance, home time, or truck maintenance? Submit requests directly to dispatch from here. No need to wait on hold. |
| 7 | `'#tour-notifications'` | Alerts & Messages | Important updates from dispatch, weather alerts, or routing changes will appear here. Keep an eye out for unread badges! |

- Remove any lingering DVIR/PreTrip/PostTrip references (confirmed clean in current file, will re-verify).

#### 2. `src/components/shared/ProductTour.tsx` — Handle `'body'` welcome step
The existing spotlight/clip-path logic expects a DOM element with dimensions. For the welcome step (`targetSelector: 'body'`), add a small guard so:
- When `targetSelector === 'body'`, skip element querying and treat it as a center-screen step (`targetRect = null`).
- This renders the tooltip centered with a uniform dimmed overlay (no spotlight cutout), which is the correct UX for a full-screen welcome.

No other ProductTour changes needed — keyboard nav, progress dots, and step counter work as-is.

### Verification
- Confirm all 7 steps render in order when the driver tour triggers.
- Confirm `'body'` step centers correctly with no broken spotlight.
- Confirm zero DVIR/PreTrip/PostTrip strings exist in `tour-steps.ts` or `ProductTour.tsx`.