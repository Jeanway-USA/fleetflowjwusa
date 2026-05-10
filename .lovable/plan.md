I found two likely causes behind the “updates appear, then revert” and route-sticking behavior:

1. The app still has production PWA/service-worker generation enabled through `vite-plugin-pwa`, while `src/main.tsx` only unregisters service workers after the app JS has already loaded. A previously installed service worker can still serve an older app shell before that cleanup runs, which matches seeing updates briefly and then an older version returning.
2. Sidebar navigation is implemented as button `onClick={() => navigate(path)}` actions instead of real route links. This can make route changes harder to preserve/debug in preview/history contexts and gives less reliable URL behavior than React Router links.

Plan:

1. **Disable stale app-shell caching**
   - Remove the PWA plugin registration from `vite.config.ts` so future preview/published builds cannot install or update a service worker that caches old routes/assets.
   - Keep the existing runtime unregister guard in `src/main.tsx` as an extra cleanup for users who already have one installed.

2. **Make sidebar routing link-based**
   - Update `AppSidebar.tsx` navigation buttons to render through React Router `Link`/`NavLink` via the existing shadcn `asChild` pattern where possible.
   - Preserve all existing sidebar styling, role filtering, active states, collapsible sections, and owner role-simulation behavior.
   - Keep special actions (sign out, simulation exit, external Discord link) as actions/anchors.

3. **Targeted verification**
   - Restart the dev server after the config change.
   - Check preview console/network for service-worker/cache errors.
   - Verify clicking sidebar items updates `window.location.pathname` and renders the selected page instead of staying on `/` or the previous route.
   - Confirm the earlier Finance page changes are still present in source; if they still do not show after cache cleanup, inspect the live preview again for a remaining build/HMR issue.

Out of scope:
- No changes to Finance dashboard layout code in this pass unless verification proves the source exists but preview still cannot load it.
- No database or backend changes.