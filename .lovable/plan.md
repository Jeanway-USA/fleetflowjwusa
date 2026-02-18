

## Changes

### 1. Redirect sign-out to landing page instead of `/auth`

Three files navigate to `/auth` after sign-out. Update each to navigate to `/` instead (which shows the Landing page for unauthenticated users via `RoleBasedRedirect`):

- **`src/components/layout/AppSidebar.tsx`** (line 98): Change `navigate('/auth')` to `navigate('/')`
- **`src/components/layout/DashboardLayout.tsx`** (line 35): Change `navigate('/auth')` to `navigate('/')`
- **`src/components/demo/DemoControls.tsx`** (line 88): Change `navigate('/auth')` to `navigate('/')`
- **`src/pages/PendingAccess.tsx`** (line 14): Change `navigate('/auth')` to `navigate('/')`

### 2. Add a "Back to Home" button on the Auth page

- **`src/pages/Auth.tsx`**: Add a link/button above or near the card that navigates back to `/` (the landing page). This will use a simple link with an arrow icon and "Back to Home" text, consistent with the existing design language.

