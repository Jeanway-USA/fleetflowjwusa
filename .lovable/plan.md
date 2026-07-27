## Change

`UpcomingPickups` currently calls `navigate('/fleet-loads')` on card click, dropping the user on the unfiltered list.

`FleetLoads.tsx` already supports a deep-link: an effect reads `?loadId=<uuid>` from the URL, finds the matching load once data has loaded, opens its detail/edit dialog, and clears the query param.

So the fix is one line in `src/components/dispatcher/UpcomingPickups.tsx`:

- Card `onClick` → `navigate(`/fleet-loads?loadId=${load.id}`)` so clicking a pickup opens that load's detail dialog directly.
- The header "View All" button keeps navigating to plain `/fleet-loads`.

No other files or backend changes needed.
