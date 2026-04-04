

## Discord Update System — Implementation Plan

### Overview
Create a system for super admins to post changelog updates that simultaneously save to a database table and send formatted embeds to a Discord channel via webhook.

### 1. Database Migration — `changelog` table

```sql
CREATE TABLE public.changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('Update', 'Announcement', 'Bug Fix')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage changelog"
  ON public.changelog FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
```

### 2. Edge Function — `supabase/functions/discord-updates/index.ts`

- Accepts POST with `{ title, description, type }`
- Validates JWT and super admin status
- Saves record to `changelog` table
- Sends a Discord webhook embed with:
  - Color: Green (`0x22c55e`) for Updates, Blue (`0x3b82f6`) for Announcements, Orange (`0xf97316`) for Bug Fixes
  - Title, description, timestamp
  - Thread/forum parameters (`thread_name` set to title) so each update creates a new forum post
- Uses the provided webhook URL stored as an environment secret (`DISCORD_WEBHOOK_URL`)

### 3. Store Discord Webhook URL as Secret
Use the `add_secret` tool to store `DISCORD_WEBHOOK_URL` with the provided value.

### 4. New Super Admin Tab — `src/components/superadmin/ChangelogTab.tsx`

- Form with Title (input), Description (textarea), Type (select: Update/Announcement/Bug Fix)
- Submit button that invokes the edge function
- Below the form: a table showing previous changelog entries from the database
- Follows existing tab patterns (Card layout, react-query, toast notifications)

### 5. Update `src/pages/SuperAdminDashboard.tsx`
- Add "Changelog" tab trigger and content rendering `<ChangelogTab />`

### Files Changed
| File | Action |
|------|--------|
| Migration SQL | Create `changelog` table with RLS |
| `supabase/functions/discord-updates/index.ts` | New edge function |
| `src/components/superadmin/ChangelogTab.tsx` | New tab component |
| `src/pages/SuperAdminDashboard.tsx` | Add Changelog tab |

