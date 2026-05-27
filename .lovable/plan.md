## Goal

Add a two-way chat thread per driver maintenance request, with a "Recommend OTR Service" quick-action that posts a highlighted recommendation card into the thread. Visible to drivers on the Driver Dashboard and to maintenance staff inside the Incoming Driver Fault Reports panel.

## 1. Database — new table `maintenance_request_messages`

```sql
CREATE TABLE public.maintenance_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  sender_user_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('driver','maintenance','owner','safety')),
  sender_name text,                       -- denormalized for fast render
  message_type text NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat','recommendation')),
  body text NOT NULL,
  recommendation jsonb,                   -- {title, category, vendor?, phone?, url?}
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mrm_request ON public.maintenance_request_messages(request_id, created_at);

GRANT SELECT, INSERT ON public.maintenance_request_messages TO authenticated;
GRANT ALL ON public.maintenance_request_messages TO service_role;
ALTER TABLE public.maintenance_request_messages ENABLE ROW LEVEL SECURITY;
```

**RLS** — same tenant + same request scoping:

- SELECT: the requesting driver (`request.driver_id = get_driver_id_for_user(auth.uid())`) OR maintenance / safety / owner role, all within `org_id = get_user_org_id(auth.uid())`.
- INSERT: same audience, plus `sender_user_id = auth.uid()` and the sender_role must match the user's actual capability (driver-owner of request OR has_role maintenance/safety/owner). `org_id` and `sender_user_id` defaulted via BEFORE INSERT trigger if omitted, mirroring the `set_maintenance_request_org_id` pattern.

**Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_request_messages;` and `ALTER TABLE … REPLICA IDENTITY FULL`.

## 2. Shared hook — `src/hooks/useMaintenanceThread.ts`

- `useMaintenanceThread(requestId)` — `useQuery(['maintenance-thread', requestId])` returning messages ordered ascending. Subscribes to a Supabase realtime channel on mount; on INSERT events, invalidates the query.
- `useSendMaintenanceMessage()` — mutation inserting `{ request_id, body, message_type, recommendation? }` with `sender_role` resolved from current user role (`'driver'` if `get_driver_id_for_user` matches, else `'maintenance'` / `'safety'` / `'owner'`). Sender role is computed client-side from already-loaded auth context; org_id + sender_user_id auto-filled by trigger.
- Marks the parent request as `'acknowledged'` on the very first maintenance-side message (so the panel reflects staff engagement).

## 3. Recommendation presets — `src/lib/maintenanceRecommendations.ts`

Static catalog (no DB needed) used by the quick-action popover:

```ts
export const RECOMMENDATION_PRESETS = [
  { id: 'roadside_tire', title: 'Roadside Tire Repair',
    category: 'tire', template: 'Call dispatch-approved roadside tire service. Stay with the truck.' },
  { id: 'ta_petro',     title: 'Nearest TA / Petro Truck Service',
    category: 'shop',  template: 'Route to the nearest TA / Petro shop and check in at the service desk.' },
  { id: 'loves',        title: 'Love\'s Truck Care',
    category: 'shop',  template: 'Stop at the nearest Love\'s Truck Care for diagnosis.' },
  { id: 'pilot',        title: 'Pilot Flying J Service',
    category: 'shop',  template: 'Head to the nearest Pilot Flying J truck service bay.' },
  { id: 'mobile_mech',  title: 'Mobile Diesel Mechanic',
    category: 'mobile',template: 'A mobile mechanic has been requested. Hold position and share live location.' },
  { id: 'tow',          title: 'Tow to Nearest Shop',
    category: 'tow',   template: 'Do not drive. Tow has been dispatched.' },
  { id: 'park_safe',    title: 'Park Safely & Wait for Instructions',
    category: 'hold',  template: 'Park in a safe location, set triangles, and await further instructions.' },
  { id: 'continue',     title: 'Safe to Continue to Destination',
    category: 'clear', template: 'Issue is non-critical. Continue carefully to the planned stop.' },
];
```

Selecting a preset opens an inline edit so staff can tweak the templated text before posting; submission writes a row with `message_type='recommendation'` and `recommendation={title, category}`.

## 4. UI component — `src/components/maintenance/MaintenanceThread.tsx`

Single shared chat thread component reused on both sides. Props: `{ requestId, viewerRole: 'driver' | 'maintenance', showRecommendations?: boolean }`.

Layout:

```text
┌─ Driver Communications Log ─────────────────────────────┐
│  ┌─ Maintenance · Sara P. · 2m ago ──────┐              │
│  │ "Confirming brake chamber on front-L?" │              │
│  └────────────────────────────────────────┘              │
│                  ┌─ Driver · John D. · 1m ago ──────┐    │
│                  │ "Confirmed, hissing audible."     │    │
│                  └───────────────────────────────────┘    │
│  ┌─ [Wrench] Recommendation · Maintenance ─────────┐    │
│  │ Roadside Tire Repair                             │    │
│  │ Call dispatch-approved roadside tire service…    │    │
│  └──────────────────────────────────────────────────┘    │
│ ───────────────────────────────────────────────────────  │
│ [textarea: Type a message…]   [📎 Recommend ▾] [Send]   │
└──────────────────────────────────────────────────────────┘
```

- Bubbles: maintenance/owner/safety align left with `bg-muted`; driver aligns right with `bg-primary/10`; recommendations are full-width with a `Wrench` icon, `border-l-4 border-primary`, distinct `bg-primary/5` and a `Recommendation` badge — regardless of side.
- Each bubble shows a role badge (`Driver` / `Maintenance` / `Safety` / `Owner`), sender name, and `formatDistanceToNow`. Hover reveals exact timestamp via `<time>` tooltip.
- Scrollable message area `max-h-80 overflow-y-auto`, auto-scrolls to bottom on new message.
- Composer: textarea (Enter submits, Shift+Enter newline), disabled while sending. When `showRecommendations && viewerRole !== 'driver'`, a `Popover` lists the presets; clicking one prefills the textarea with the template and switches the submit button label to "Post Recommendation" until cleared.
- Empty state: friendly "Start the conversation" prompt.

## 5. Wire into existing UI

### Maintenance side — `src/components/maintenance/DriverFaultReportsPanel.tsx`

- Extend the panel query to include `status IN ('submitted','acknowledged','in_progress')` so converted requests stay in the panel while the thread is active. (Add a small "Linked WO" badge for `in_progress`.)
- Each `ReportRow` gets a "Conversation" toggle button next to Acknowledge/Convert. When toggled, render `<MaintenanceThread requestId={report.id} viewerRole="maintenance" showRecommendations />` directly under that row.
- Unread hint: small dot when latest message's `sender_role === 'driver'` and created after the row was last opened (tracked in component state).

### Driver side — `src/components/driver/MaintenanceRequestCard.tsx`

- Each open request row gets an inline "Open thread" toggle (no dialog) that renders `<MaintenanceThread requestId={request.id} viewerRole="driver" />`. No recommendation picker on the driver side.
- Keep the existing `admin_notes` "Shop Response" block visible (legacy entries).

### App.tsx

- Allow the `maintenance` role to access existing thread inserts via the new table's RLS — handled by the migration above; no router changes.

## What does NOT change

- `maintenance_requests` schema, the Driver dashboard's Report Issue form, the convert-to-work-order flow, KPI cards, PM tab, Service History, work_orders policies.
- No new edge functions, no email notifications in this iteration — purely in-app realtime chat.

## Files touched

- **DB migration** — new `maintenance_request_messages` table, trigger, RLS, realtime publication.
- `src/hooks/useMaintenanceThread.ts` — **new**.
- `src/lib/maintenanceRecommendations.ts` — **new**.
- `src/components/maintenance/MaintenanceThread.tsx` — **new** (shared chat UI).
- `src/components/maintenance/DriverFaultReportsPanel.tsx` — add toggle + render thread; widen status filter.
- `src/components/driver/MaintenanceRequestCard.tsx` — add inline thread toggle per request.
