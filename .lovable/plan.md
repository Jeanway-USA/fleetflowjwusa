

## Plan: Unified Driver Request System + Remove Pre/Post Trip DVIR

### Overview

This plan consolidates four separate driver request types (Detention, Home Time, PTO, and Maintenance Reporting) into a single unified "Driver Requests" system. It also removes the Pre-Trip and Post-Trip DVIR buttons and history from the driver dashboard since inspections are tracked through the ELD.

---

### Part 1: Remove Pre/Post Trip DVIR

Since inspections are tracked through ELD, the following will be removed from the driver dashboard:

**Remove from `src/pages/DriverDashboard.tsx`:**
- The `DVIRButtons` component and its grid container (the 3-column quick actions row)
- The `DVIRHistory` component at the bottom
- The query for `todayInspections` (no longer needed on this page)
- All related imports (`DVIRButtons`, `DVIRHistory`)

**Remove from `src/pages/DriverSpectatorView.tsx`:**
- The `DVIRHistory` component and its import

**Note:** The DVIR components themselves (`DVIRButtons.tsx`, `DVIRHistory.tsx`, `PreTripForm.tsx`, `PostTripForm.tsx`) will NOT be deleted -- they are still used by the Safety module's inspection history page. Only the references from the driver dashboard are removed.

The "Scan Doc" button currently in the 3-column grid will be repositioned into the new unified request card.

---

### Part 2: Create Unified "Driver Requests" Database Table

A new `driver_requests` table replaces the need for separate workflows per request type:

```
driver_requests
  - id (uuid, PK)
  - driver_id (uuid, FK to drivers)
  - request_type (text): 'detention', 'home_time', 'pto', 'maintenance'
  - priority (text): 'low', 'medium', 'high', 'critical'
  - status (text): 'pending', 'approved', 'denied', 'completed'
  - subject (text): Short summary/title
  - description (text): Detailed notes from the driver
  - load_id (uuid, nullable): For detention requests, links to the load
  - truck_id (uuid, nullable): For maintenance requests, links to the truck
  - responded_by (uuid, nullable): The dispatcher/safety user who responded
  - responded_at (timestamptz, nullable)
  - response_notes (text, nullable): Dispatcher/safety response
  - created_at (timestamptz)
  - updated_at (timestamptz)
```

**RLS Policies:**
- Drivers can INSERT requests where `driver_id` matches their own
- Drivers can SELECT their own requests
- Operations roles (owner, dispatcher) can SELECT all requests
- Owner and dispatcher can UPDATE all requests (for responding)

---

### Part 3: Unified Request Form Component

**New file:** `src/components/driver/DriverRequestForm.tsx`

A single form that adapts based on the selected request type:

- **Request Type selector** at the top with four options:
  - Detention (shows load selector, pre-fills current active load)
  - Home Time (shows date range picker for requested dates)
  - PTO (shows date range picker for requested dates)
  - Maintenance (shows truck info auto-filled, issue type dropdown, priority selector)

- **Common fields** for all types:
  - Description/Notes textarea
  - Priority selector (only visible for maintenance type)
  - Submit button

The form inserts into the unified `driver_requests` table.

---

### Part 4: Unified Request Card on Driver Dashboard

**New file:** `src/components/driver/DriverRequestsCard.tsx`

Replaces the old `MaintenanceRequestCard` and consolidates all request types:

- **Header:** "My Requests" with a "+ New Request" button that opens the unified form
- **Quick action buttons** in a row below the header:
  - "Request Detention" (pre-selects detention type)
  - "Home Time" (pre-selects home_time type)
  - "PTO" (pre-selects pto type)
  - "Report Issue" (pre-selects maintenance type)
- **Open requests list** below showing all pending/in-progress requests grouped by type with status badges
- Each request shows: type icon, subject, status badge, submitted date, and response (if any)

---

### Part 5: Update Dispatcher Alerts Panel

**Modify:** `src/components/dispatcher/DispatcherAlerts.tsx`

- Replace the existing `detention_requests` query with a query against the new `driver_requests` table filtered by `status = 'pending'`
- Show ALL pending request types (not just detention) in the Alerts panel
- Each request type gets its own icon:
  - Detention: Clock icon
  - Home Time: Home icon
  - PTO: Calendar icon  
  - Maintenance: Wrench icon
- Keep the same Approve/Deny workflow with response dialog
- On response, create a `driver_notification` to inform the driver of the decision

---

### Part 6: Update ActiveLoadCard

**Modify:** `src/components/driver/ActiveLoadCard.tsx`

- Remove the standalone `RequestDetentionButton` import and usage
- Detention requests are now handled through the unified request card on the dashboard

---

### Part 7: Dashboard Layout Update

**Modify:** `src/pages/DriverDashboard.tsx`

The updated dashboard layout (top to bottom):
1. Greeting header with notifications and date
2. No truck warning (if applicable)
3. Active Load Card (without separate detention button)
4. Next Load Preview
5. Document Scan button (standalone, moved from the old 3-column grid)
6. GPS + Pay row
7. Monthly Bonus Goal
8. **Driver Requests Card** (new unified component, replaces MaintenanceRequestCard)

---

### Part 8: Update Spectator View

**Modify:** `src/pages/DriverSpectatorView.tsx`

- Remove DVIR History section
- Replace the inline maintenance requests display with a read-only view of the driver's requests from the new `driver_requests` table
- Show all request types with their status

---

### Technical Summary

| Action | File | Details |
|--------|------|---------|
| DB Migration | New migration | Create `driver_requests` table with RLS policies |
| Create | `src/components/driver/DriverRequestForm.tsx` | Unified request form with type-adaptive fields |
| Create | `src/components/driver/DriverRequestsCard.tsx` | Dashboard card showing all requests with quick-action buttons |
| Modify | `src/pages/DriverDashboard.tsx` | Remove DVIR components, replace MaintenanceRequestCard with DriverRequestsCard |
| Modify | `src/pages/DriverSpectatorView.tsx` | Remove DVIRHistory, update to show unified requests |
| Modify | `src/components/dispatcher/DispatcherAlerts.tsx` | Query `driver_requests` instead of `detention_requests`, handle all request types |
| Modify | `src/components/driver/ActiveLoadCard.tsx` | Remove standalone RequestDetentionButton |

**Existing `detention_requests` and `maintenance_requests` tables** will remain in the database for historical data. New requests will go through the unified `driver_requests` table. The old components (`RequestDetentionButton.tsx`, `MaintenanceRequestForm.tsx`, `MaintenanceRequestCard.tsx`) will no longer be imported but won't be deleted in case they're referenced elsewhere.

