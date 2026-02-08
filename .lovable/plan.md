

## Comprehensive TMS Review: Improvements, Gaps, and Feature Opportunities

After reviewing every page, component, database table, and the overall architecture, here is a prioritized breakdown of what can be improved, simplified, expanded, or added.

---

### 1. CRITICAL MISSING TMS FEATURES

These are standard features that most trucking companies need and that the system currently lacks.

**A. Hours of Service (HOS) / ELD Integration**
- There is no Hours of Service tracking anywhere in the system
- Most carriers are required by FMCSA to track driver hours (11-hour driving limit, 14-hour on-duty, 70-hour/8-day cycle)
- At minimum, a manual HOS log or an ELD integration status dashboard would be valuable
- The driver dashboard should show remaining hours and duty status
- This impacts dispatch decisions (assigning loads to drivers who have hours available)

**B. Load Board / Available Loads**
- Drivers and dispatchers cannot browse or search for available loads from Landstar's load board
- A basic load search or integration to surface available loads would streamline the booking workflow
- Currently loads must be manually entered or parsed from rate confirmations

**C. Customer / Shipper & Receiver Management**
- No customer database exists -- origin and destination are just free-text address fields on loads
- Storing shipper/receiver contacts, facility hours, dock requirements, and appointment scheduling would reduce repeated data entry and enable better planning
- Common in TMS: a Facilities/Locations table with addresses, contacts, hours, notes

**D. Automated Mileage Tracking per Jurisdiction (IFTA)**
- The IFTA page requires manually entered `ifta_records` by jurisdiction
- The system has `driver_locations` with GPS data and `fleet_loads` with origin/destination -- this data could be used to automatically calculate miles driven per state
- This is a major time-saver for quarterly IFTA filing

**E. Proof of Delivery (POD) Workflow**
- While documents can be uploaded, there is no structured POD capture workflow
- When a driver completes delivery, the system should prompt for: signature capture, photo of BOL/POD, delivery timestamp, and any exception notes
- This should auto-change load status to "delivered" and notify dispatch

---

### 2. FEATURES THAT NEED EXPANSION

These exist in some form but need improvement.

**A. Load Lifecycle Gaps**
- No "unloading" or "at_pickup" / "at_delivery" status transitions in the load form dropdown (the executive dashboard queries for `at_pickup` and `at_delivery` statuses, but these aren't selectable in the FleetLoads form)
- No structured pickup/delivery appointment tracking (time windows, not just dates)
- No shipper/consignee reference numbers
- Missing: weight, commodity type, equipment requirements, temperature requirements (for reefer)
- No delivery confirmation or exception handling workflow

**B. Dispatcher Dashboard Enhancements**
- The FleetMapView shows active loads on a map but does not show available/idle trucks that aren't on loads
- No drag-and-drop load assignment
- The DriverAssignmentPanel exists but there is no visibility into driver HOS/availability beyond just "not currently on a load"
- Missing: a timeline/Gantt view showing driver schedules over the next 7 days

**C. Settlement System Improvements**
- Settlements exist but are somewhat disconnected from loads -- there is no automated settlement generation from delivered loads
- The `SettlementsTab` component exists but calculating settlements requires manual data entry
- A "Generate Settlement" button that pulls all delivered loads in a date range, applies the driver's pay rate, and creates a draft settlement would be very valuable

**D. Notifications System**
- Driver notifications exist but there are no email or push notifications
- Critical alerts (expired credentials, overdue inspections, pending maintenance) only show on dashboards -- no proactive alerting
- Dispatch responses to driver requests should trigger real-time notifications

**E. IFTA Report Auto-Generation**
- The IFTA page has manual jurisdiction records and fuel purchases
- Missing: auto-computing taxable miles per state from load routes, auto-linking fuel expenses to fuel purchases, and generating the actual IFTA tax calculation (tax owed = miles in state x fleet MPG x state tax rate - fuel tax paid in state)

---

### 3. SIMPLIFICATION OPPORTUNITIES

Areas where code or UX can be streamlined.

**A. Finance Page is Monolithic (2,200 lines)**
- `Finance.tsx` is extremely large with expenses, payroll, commissions, statements, and settings all in one file
- This should be broken into separate tab components (like how Maintenance already uses `ActiveWorkOrdersTab`, `PreventiveMaintenanceTab`, etc.)
- Each tab (P&L Summary, Expenses, Payroll, Commissions, Settlements, Statements) should be its own component

**B. FleetLoads Page is Very Large (1,076 lines)**
- The load creation form, load table, revenue calculations, rate confirmation handling, and accessorial management are all in one component
- The load form should be extracted into a `LoadFormDialog` component
- Revenue calculation logic should be a shared utility or hook

**C. Duplicate Utility Functions**
- `formatCurrency`, `formatDate`, `getDriverName`, `getTruckName` are duplicated across many pages (FleetLoads, Finance, Incidents, IFTA, CompanyInsights, etc.)
- These should be centralized in `src/lib/utils.ts` or a dedicated `src/lib/formatters.ts`

**D. Settings Page Could Use Sub-routes**
- The Settings page (873 lines) handles users, roles, appearance, bonus goals, and general settings in one large component
- Breaking into sub-pages or separate components would improve maintainability

---

### 4. IMPROVEMENTS TO EXISTING FEATURES

**A. Executive Dashboard**
- The `onTimeRate` is hardcoded to 95% as a placeholder -- it should be calculated from actual delivery dates vs. scheduled delivery dates
- Revenue per mile uses net revenue but should also show gross RPM for comparison
- Missing: deadhead/empty miles tracking and ratio (the `empty_miles` column exists on `fleet_loads` but isn't used in the executive dashboard)
- No year-over-year comparison charts

**B. Safety Dashboard is Basic**
- The Safety page only shows credential expiration alerts and truck status
- Missing: DVIR/inspection history summary, incident trends over time, CSA score tracking, drug test compliance
- The `DefectAlerts` and `InspectionHistory` components exist but aren't used on the Safety page

**C. Driver Performance**
- Performance scoring exists but has no historical trend tracking
- No export/PDF capability for performance reviews
- Missing: fuel efficiency tracking per driver, idle time metrics

**D. Trailer Management**
- Trailers don't track mileage or have maintenance schedules
- Trailers aren't linked to loads (the `trailer_id` column exists on `fleet_loads` but the UI doesn't set it during load creation)
- No tire tracking or brake inspection dates

**E. Document Management**
- Documents are uploaded but not categorized by load, truck, or driver in a structured way
- No OCR or automatic data extraction from BOLs or receipts
- No document expiration tracking (insurance certificates, registrations)

---

### 5. TECHNICAL IMPROVEMENTS

**A. Data Pagination**
- Most pages fetch all records without pagination (drivers, trucks, loads, expenses)
- For growing fleets, this will hit the Supabase 1,000-row limit and cause slow load times
- Adding server-side pagination or virtual scrolling would be important for scalability

**B. Offline Support**
- `useOfflineSync.ts` exists as a hook but is not used anywhere in the application
- For drivers in areas with poor connectivity, offline support for DVIRs, status updates, and document capture would be valuable

**C. Real-time Updates**
- The dispatcher dashboard would benefit from real-time updates when drivers change load status or update their location
- Currently, data only refreshes on page load or manual refetch

**D. Error Handling**
- Many queries don't have error UI states -- they show "Loading..." or nothing
- A consistent error state component should be used across all pages

---

### RECOMMENDED PRIORITY ORDER

| Priority | Feature | Impact |
|----------|---------|--------|
| 1 | Break up Finance.tsx into sub-components | Maintainability, developer velocity |
| 2 | Load lifecycle improvements (status transitions, trailer assignment, POD workflow) | Core TMS functionality |
| 3 | Automated settlement generation from delivered loads | Major time savings for payroll |
| 4 | Centralize duplicate utility functions | Code quality |
| 5 | Safety dashboard expansion (use existing DefectAlerts and InspectionHistory components) | Compliance |
| 6 | Auto-calculate IFTA miles from routes | Quarterly tax filing efficiency |
| 7 | Customer/Facility database | Reduce repeated data entry |
| 8 | Real-time dispatcher updates | Operational efficiency |
| 9 | Executive dashboard fixes (on-time rate, empty miles) | Accurate reporting |
| 10 | HOS tracking or ELD status display | FMCSA compliance |

