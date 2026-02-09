

# CRM -- Unified Business Relationship Management

## Overview

Add a full CRM (Customer Relationship Management) page that centralizes all business contacts -- brokers, agents, shippers, receivers, and vendors -- into a single searchable directory. Each contact has an activity log, linked load history, and revenue analytics. This replaces scattered free-text fields with structured, trackable relationships.

---

## What You'll Get

### 1. Contacts Directory
A new **/crm** page with a unified view of all business contacts, organized by type:
- **Brokers** -- companies that book loads for you
- **Agents** -- Landstar agent codes you work with (migrated from Resources)
- **Shippers** -- pickup locations (linked from Facilities)
- **Receivers** -- delivery locations (linked from Facilities)
- **Vendors** -- mechanics, roadside, truck washes (linked from Resources)

Each contact card shows name, type, contact info, tags, and quick stats (total loads, total revenue).

### 2. Contact Detail View
Clicking any contact opens a detail panel (sheet/drawer) with:
- Editable contact info (name, phone, email, address, notes)
- **Activity Log** -- timestamped entries for calls, emails, notes, meetings. Anyone with access can log an interaction.
- **Load History** -- all loads linked to this contact (matched by broker name, agent code, or facility), with dates, routes, and revenue
- **Revenue Analytics** -- total revenue, average rate per mile, load count, and a small trend chart

### 3. Smart Linking
- When creating/editing a load on Fleet Loads, the broker/agent fields become searchable dropdowns that pull from CRM contacts
- Existing loads will be matched to CRM contacts by broker name and agent code
- Facilities from the Resources page can be linked as CRM contacts (shipper/receiver type)

### 4. Dashboard Summary Cards
Top of the CRM page shows:
- Total contacts by type
- Top 5 contacts by revenue (last 90 days)
- Contacts with no activity in 30+ days (follow-up needed)

---

## Navigation

The CRM page will be added to the sidebar under a new **"CRM"** group (or under the existing **Operations** group), accessible to **owner** and **dispatcher** roles.

---

## Technical Details

### New Database Table: `crm_contacts`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| contact_type | text | 'broker', 'agent', 'shipper', 'receiver', 'vendor' |
| company_name | text | Company or business name |
| contact_name | text | Primary contact person |
| phone | text | Phone number |
| email | text | Email address |
| address | text | Physical address |
| city | text | City |
| state | text | State abbreviation |
| tags | text[] | Flexible tags for categorization |
| agent_code | text | Landstar agent code (for agents) |
| agent_status | text | 'safe' or 'unsafe' (for agents) |
| website | text | Website URL |
| notes | text | General notes |
| is_active | boolean | Whether contact is active (default true) |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-updated |

RLS Policies:
- Owner and dispatcher can perform all operations (using `has_operations_access`)
- Safety role gets read-only access
- Drivers get read-only access (for looking up contact info)

### New Database Table: `crm_activities`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| contact_id | uuid (FK) | References crm_contacts |
| user_id | uuid | Who logged the activity |
| activity_type | text | 'call', 'email', 'note', 'meeting', 'load_booked' |
| subject | text | Brief subject line |
| description | text | Detailed notes |
| activity_date | timestamptz | When it happened |
| created_at | timestamptz | Auto-set |

RLS Policies:
- Operations access for full CRUD
- Read-only for safety and drivers

### New Database Table: `crm_contact_loads`
A linking table to associate CRM contacts with fleet loads:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| contact_id | uuid (FK) | References crm_contacts |
| load_id | uuid (FK) | References fleet_loads |
| relationship_type | text | 'broker', 'agent', 'shipper', 'receiver' |
| created_at | timestamptz | Auto-set |

RLS Policies:
- Same as crm_contacts (operations access)

### Files to Create

1. **`src/pages/CRM.tsx`** -- Main CRM page with:
   - Contact type filter tabs (All, Brokers, Agents, Shippers, Receivers, Vendors)
   - Search bar with real-time filtering
   - Summary cards (total contacts, top revenue contacts, follow-up needed)
   - Contact table/grid with sortable columns
   - Add/Edit contact dialog
   - Delete confirmation

2. **`src/components/crm/ContactDetailSheet.tsx`** -- Slide-out detail view with:
   - Contact info header (editable)
   - Tabbed content: Activity Log, Load History, Revenue Analytics
   - "Log Activity" form

3. **`src/components/crm/ActivityTimeline.tsx`** -- Chronological list of activities with icons per type, relative timestamps

4. **`src/components/crm/ContactRevenueStats.tsx`** -- Revenue analytics card showing total revenue, load count, avg rate/mile, and a small bar chart of monthly revenue (using recharts)

5. **`src/components/crm/ContactLoadHistory.tsx`** -- Table of linked loads with date, route, rate, status

### Files to Modify

1. **`src/App.tsx`** -- Add `/crm` route
2. **`src/components/layout/AppSidebar.tsx`** -- Add CRM nav item under Operations (accessible to owner, dispatcher)

### Database Migration
One migration to create the three new tables (`crm_contacts`, `crm_activities`, `crm_contact_loads`) with:
- RLS enabled on all three
- Appropriate policies using existing `has_operations_access`, `has_safety_access` functions
- Foreign key constraints
- Updated_at trigger on `crm_contacts`
- Unique constraint on `crm_contact_loads` (contact_id, load_id, relationship_type)

### No New Dependencies
Uses existing: recharts, lucide-react, Radix UI components, TanStack Query, date-fns.

