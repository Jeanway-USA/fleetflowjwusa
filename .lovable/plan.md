## Hide Discord Promotion and Feedback Widget for JeanWay USA

### Problem
The Discord banner, Discord sidebar link, feedback floating button, and Discord link in the welcome modal should be hidden for users belonging to the JeanWay USA organization (org ID: `a0000000-0000-0000-0000-000000000001`). This org is the internal operator of the app and does not need beta feedback collection or Discord community advertising.

### Changes

1. **`src/components/shared/DiscordBanner.tsx`**
   - Import `useAuth` and read `orgName`.
   - Add early-return guard: if `orgName` case-insensitively contains `"jeanway"`, render `null`.

2. **`src/components/shared/BetaFeedbackWidget.tsx`**
   - Already imports `useAuth` for `user` and `orgId`. Read `orgName` as well.
   - Add early-return guard: if `orgName` case-insensitively contains `"jeanway"`, render `null`.

3. **`src/components/shared/WelcomeBetaModal.tsx`**
   - Import `useAuth` and read `orgName`.
   - Conditionally render the Discord footer link only when org is **not** JeanWay USA.

4. **`src/components/layout/AppSidebar.tsx`**
   - Read `orgName` from `useAuth()` (already used elsewhere in the file).
   - Wrap the "Community & Support" Discord anchor in a conditional so it only renders when org is **not** JeanWay USA.

### Why orgName and not orgId?
`orgName` is already fetched and available in `AuthContext` without adding an extra database round-trip. A case-insensitive check on `"jeanway"` is robust against minor name variations.

### No database or backend changes required.
All gating is done client-side using existing auth context data.