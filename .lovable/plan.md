

## 1. Lazy-Load All Page Components in App.tsx

Replace all 24 static page imports with `React.lazy()` calls and wrap the `<Routes>` in a `<Suspense>` with a centered spinner fallback.

**File:** `src/App.tsx`
- Remove all `import Xxx from "./pages/Xxx"` lines (lines 13-41)
- Replace with `const Xxx = lazy(() => import("./pages/Xxx"))` for each page
- Add `import { lazy, Suspense } from "react"`
- Wrap `<Routes>` in `<Suspense fallback={<LoadingSpinner />}>` using a simple inline spinner (Loader2 icon centered on screen)

All 24 pages become lazy: Auth, ResetPassword, Trucks, Trailers, Drivers, FleetLoads, AgencyLoads, Finance, CompanyInsights, MaintenanceManagement, Documents, Safety, Settings, DriverDashboard, DispatcherDashboard, ExecutiveDashboard, DriverSettings, DriverStats, Incidents, DriverPerformance, DriverSpectatorView, IFTA, CRM, NotFound, PendingAccess, Landing, Pricing, Onboarding, SuperAdminDashboard.

Non-page imports (ProtectedRoute, SuperAdminGuard, RoleBasedRedirect, ErrorBoundary, contexts, UI) stay as static imports since they're needed on every route.

---

## 2. Refactor MaintenanceRequestForm with react-hook-form + zod

**File:** `src/components/driver/MaintenanceRequestForm.tsx`

Replace manual `useState` + toast-based validation with `useForm` from react-hook-form and a zod schema.

**Zod schema:**
```typescript
const maintenanceRequestSchema = z.object({
  issueType: z.string().min(1, "Please select an issue type"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000, "Description must be less than 1000 characters"),
});
```

**Form integration:**
- Use `useForm` with `zodResolver(maintenanceRequestSchema)` and default values (`priority: 'medium'`)
- Replace manual `useState` for issueType/priority/description with `register` and `Controller` (for Select components)
- Display inline `<p className="text-sm text-destructive">` error messages below each field using `formState.errors`
- `handleSubmit` from react-hook-form replaces the manual `handleSubmit` — only fires when validation passes
- Keep the existing `useMutation` logic unchanged

**Files Modified:**
| File | Change |
|---|---|
| `src/App.tsx` | Replace static imports with `React.lazy()`, add `Suspense` wrapper |
| `src/components/driver/MaintenanceRequestForm.tsx` | Refactor to react-hook-form + zod validation |

