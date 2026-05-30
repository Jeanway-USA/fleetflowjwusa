## Plan: Verify driver onboarding routing and separation

After auditing the codebase, all three requirements are already satisfied. No code changes are needed.

### Findings

**1. Protected route exists (`src/App.tsx`)**
```tsx
<Route path="/driver/onboarding" element={
  <ProtectedRoute allowedRoles={['driver']}>
    <DriverOnboarding />
  </ProtectedRoute>
} />
```
Plus `RoleBasedRedirect.tsx` already redirects drivers with unsigned templates to `/driver/onboarding`.

**2. Driver wizard logic lives in `src/pages/DriverOnboarding.tsx`**
- Step-by-step state: `stepIndex`, `totalSteps`, progress bar
- Step 1: `<DriverCredentialsStep>` (react-hook-form + zod, including `phone_number`)
- Steps 2+: `<DocumentTemplateRenderer>` parsing `{{phone_number}}` and other tokens
- Submission writes signed docs and updates the `drivers` row

**3. `src/pages/Onboarding.tsx` is owner-only setup**
Its three steps are `['Organization', 'Fleet Setup', 'Invite Team']` — no driver credentials, no document template parser, no `phone_number` field. It is the org owner's initial setup flow and is cleanly separated from the driver contract flow.

### Recommendation

Close this task as already-complete. If you'd like, I can instead:
- Add a redirect from any legacy `/onboarding?role=driver`-style URL to `/driver/onboarding`, or
- Add a test asserting the route + role guard,

but neither is required by the current request.
