

## Build SmartLoadCreator Component

### Overview
A polished rate confirmation upload component with framer-motion animations and a 3-column parsed results grid. Uses the existing `parse-rate-confirmation` edge function for real AI extraction — no mock data.

### Changes

**1. Install framer-motion**
- `npm install framer-motion`

**2. Create `src/components/loads/SmartLoadCreator.tsx`**

Self-contained component that wraps the existing rate confirmation parsing flow with enhanced UX:

- **Drop zone**: Reuses the same drag-and-drop pattern from `RateConfirmationUpload` but with updated copy: "Drag & Drop Broker Rate Confirmation PDF here or click to browse"
- **Scanning animation**: When file is dropped, show a framer-motion animated card with a pulsing scan icon and an animated `Progress` bar that fills over ~3 seconds with text "Extracting Load Details via AI..."
- **Parsed Results (3-column grid)**: Appears after extraction completes, animated in with `motion.div` fade+slide:
  - **Column 1 — Broker Info**: Broker Name (from origin context or notes), Load/Reference ID, Contact info if available
  - **Column 2 — Logistics**: Origin City/State, Destination City/State, Total Miles, Pick-up Date, Delivery Date
  - **Column 3 — Financials**: Gross Rate (rate + FSC), Rate Per Mile (calculated from rate+FSC / miles), Equipment type if available
- **Bottom**: Large primary Button "Review & Create Load" that calls `onDataExtracted` callback

**Processing**: Calls `supabase.functions.invoke('parse-rate-confirmation')` via the same storage-upload-then-invoke pattern already used in `RateConfirmationUpload`. All data is real AI-extracted data, not mock.

**3. Integrate into `src/pages/FleetLoads.tsx`**
- Add `SmartLoadCreator` as an alternative view option or replace the existing `RateConfirmationUpload` in the "Add Load" dialog for Independent mode users.

### Technical details
- framer-motion: `AnimatePresence`, `motion.div` for fade/slide transitions on results grid
- Progress bar: Uses shadcn `Progress` with a `useEffect` interval to animate value from 0→90 during processing, snaps to 100 on completion
- No mock data — all results come from the existing `parse-rate-confirmation` edge function
- Reuses `useAuth`, `useStorageProvider`, `useOrganizationMode` hooks
- Component accepts same props as `RateConfirmationUpload` for compatibility

