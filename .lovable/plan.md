

## Redesign Onboarding Wizard

### Overview
Replace the current 3-step onboarding (Company / Plan / First Load) with a new 3-step wizard: **Organization Profile**, **Fleet Setup**, and **Invite Team**. The plan selection tier is removed from onboarding (defaults to `solo_bco` via the existing `create_onboarding_org` RPC). On completion, users redirect to the Dispatcher Dashboard.

### Database Migration
Add `dot_number` and `mc_number` columns to the `organizations` table so they persist (currently they were only local state and never saved):

```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS dot_number text,
  ADD COLUMN IF NOT EXISTS mc_number text;
```

### Step 1: Organization Profile
- Company Name (required), DOT Number (optional), MC Number (optional) — same as before
- **Logo Upload**: File input that uploads to `branding-assets` bucket via `supabase.storage`, then saves the path to `organizations.logo_url`
- Calls `create_onboarding_org` RPC to create org, then updates org with DOT/MC/logo_url
- Advances to Step 2

### Step 2: Fleet Setup
- Quick-add form for **one Truck**: Unit Number (required), Make, Model, Year, VIN
- Quick-add form for **one Trailer**: Unit Number (required), Trailer Type (dropdown: dry_van, reefer, flatbed, etc.), Make, Year
- Inserts into `trucks` and `trailers` tables with the new `org_id`
- **Skip** button available

### Step 3: Invite Team
- Dynamic list of email + role pairs (add/remove rows)
- Role select from: dispatcher, payroll_admin, safety, driver
- On submit, calls the existing `invite-user` edge function for each entry
- **Skip** button available
- On complete/skip: calls `refreshOrgData()` + `refreshRoles()`, fires confetti, redirects to `/dispatcher`

### UI Design
- Full-screen layout with centered card, same banner header as current
- Stepper indicator at top with 3 labeled steps and progress bar (reuse existing pattern)
- Each step is a Card with icon header, form fields, and Back/Skip/Continue buttons
- Uses existing shadcn/ui components: Card, Input, Label, Select, Button, Progress

### Files Modified
| File | Action |
|---|---|
| `src/pages/Onboarding.tsx` | Full rewrite with new 3-step wizard |
| Database migration | Add `dot_number`, `mc_number` to `organizations` |

### Notes
- The `invite-user` edge function already exists and handles auth invites + role pre-assignment + email via Resend
- Truck insert requires `org_id` (not null) and `unit_number` — all other fields optional
- Trailer insert requires `unit_number` and `trailer_type` — `org_id` is nullable but we'll set it
- Logo upload uses direct `supabase.storage.from('branding-assets')` (same pattern as BrandingTab)
- No new edge functions needed

