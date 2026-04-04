

## Fix Demo Controls

### Problem 1: Tier buttons appear to do nothing
The tier switch updates the database and refreshes the auth context, but the user stays on the current page. Since the sidebar items change but the current page may still be accessible, there's no visible feedback beyond the toast. The fix: after switching tiers, navigate to the correct landing page for that tier.

### Problem 2: "Start Beta Account" navigates to landing instead of auth
Line 88 navigates to `/` after signing out. It should navigate to `/auth` so prospects go straight to the signup form.

### Changes — `src/components/demo/DemoControls.tsx`

**Tier switch handler** — after `refreshOrgData()`, navigate to the appropriate dashboard:
- `solo_bco` → `/fleet-loads`
- `fleet_owner` → `/executive-dashboard`
- `agency` → `/agency-loads`

**Start Beta button** — change `navigate('/')` to `navigate('/auth')`.

