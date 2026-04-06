

## PWA with Offline Capabilities for FleetFlow TMS

### Overview
Convert FleetFlow into an installable PWA with a service worker for asset caching, an offline mode indicator in the dashboard header, and an expanded offline sync system for driver actions (fuel receipts, load status updates) that auto-syncs to the backend when connectivity returns.

### Important Caveat
PWA features (offline support, install prompts) will only work in the **published** version of the app, not in the Lovable editor preview. The service worker is disabled in development to avoid caching issues.

---

### Files to Create

**1. `public/manifest.json`** — Web app manifest
- App name: "FleetFlow TMS", short name: "FleetFlow"
- `display: "standalone"`, theme/background colors matching brand
- Icon placeholders (192px, 512px)

**2. `src/components/shared/OfflineIndicator.tsx`** — Offline mode badge
- Uses the existing `useOfflineSync` hook for `isOnline`, `pendingCount`, `isSyncing`
- Shows a persistent amber banner/pill in the header when offline: "Offline — N pending"
- Shows a brief green "Syncing..." indicator when reconnecting
- Compact enough to sit in the DashboardLayout header bar

**3. `src/hooks/useOfflineQueue.ts`** — Generic offline action queue (replaces/extends `useOfflineSync`)
- Stores pending actions in localStorage with type discrimination: `load_status_update`, `fuel_receipt`, `dvir_inspection`
- Each action has: `id`, `type`, `payload`, `timestamp`
- On reconnect, processes the queue in order, calling the appropriate Supabase insert/update for each type
- Removes successfully synced items; retains failed ones with retry
- Exposes: `isOnline`, `pendingCount`, `isSyncing`, `enqueue(action)`, `syncAll()`

---

### Files to Update

**4. `vite.config.ts`** — Add `vite-plugin-pwa`
- Install `vite-plugin-pwa` dependency
- Configure with `registerType: 'autoUpdate'`, `devOptions: { enabled: false }`
- `navigateFallbackDenylist: [/^\/~oauth/]`
- Workbox runtime caching for Supabase API calls (NetworkFirst strategy)
- Precache app shell assets

**5. `src/main.tsx`** — Service worker registration guard
- Add iframe/preview-host detection guard
- Unregister any stale service workers when in preview/iframe context
- Only register SW in production on the published domain

**6. `index.html`** — Add manifest link and meta tags
- `<link rel="manifest" href="/manifest.json">`
- `<meta name="theme-color">`, apple touch icon meta tags

**7. `src/components/layout/DashboardLayout.tsx`** — Add `OfflineIndicator`
- Import and render `<OfflineIndicator />` in the header bar (next to breadcrumbs)

**8. `src/App.tsx`** — Configure TanStack Query for offline
- Set `QueryClient` with `networkMode: 'offlineFirst'` so queries serve cached data when offline
- Add `gcTime: Infinity` for critical driver queries to persist cache longer

**9. `src/hooks/useOfflineSync.ts`** — Refactor to use `useOfflineQueue`
- Delegate to the new generic queue instead of duplicating online/offline logic
- Keep the existing DVIR-specific interface as a wrapper

**10. `src/components/driver/ActiveLoadCard.tsx`** — Offline status updates
- When updating load status offline, enqueue the action via `useOfflineQueue` instead of failing
- Show toast: "Status update saved. Will sync when online."

---

### Technical Details

- **Service Worker Strategy**: Precache app shell (HTML, JS, CSS). Use NetworkFirst for API calls so cached responses are served when offline.
- **TanStack Query `networkMode: 'offlineFirst'`**: Queries return stale cached data when offline instead of throwing errors. Mutations are paused and retried on reconnect.
- **Offline Queue Storage**: localStorage-based (simple key-value). Actions are JSON-serializable payloads. File uploads (fuel receipts) store metadata only — actual file upload happens on sync via the Supabase storage API.
- **Auto-sync**: The `useOfflineQueue` hook listens for the `online` window event and triggers `syncAll()` automatically.

### Dependencies to Install
- `vite-plugin-pwa` (dev dependency)

### Files Summary
| File | Action |
|------|--------|
| `public/manifest.json` | Create — PWA manifest |
| `src/components/shared/OfflineIndicator.tsx` | Create — offline status badge |
| `src/hooks/useOfflineQueue.ts` | Create — generic offline action queue |
| `vite.config.ts` | Update — add vite-plugin-pwa |
| `src/main.tsx` | Update — SW registration guard |
| `index.html` | Update — manifest link + meta tags |
| `src/components/layout/DashboardLayout.tsx` | Update — render OfflineIndicator |
| `src/App.tsx` | Update — TanStack Query offline config |
| `src/hooks/useOfflineSync.ts` | Update — delegate to useOfflineQueue |
| `src/components/driver/ActiveLoadCard.tsx` | Update — offline-safe status updates |

