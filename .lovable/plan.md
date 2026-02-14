

# Make Landing Page the Root Route

## Change

Move the landing page from `/landing` to `/` so it's the first thing visitors see. Authenticated users continue to be redirected to their role-appropriate dashboard.

## Technical Details

### File: `src/components/shared/RoleBasedRedirect.tsx`

- Change the unauthenticated redirect from `<Navigate to="/landing" replace />` to render the `<Landing />` component directly (or redirect is no longer needed since Landing will be at `/`).

### File: `src/App.tsx`

- Change the `/` route from `<RoleBasedRedirect />` to a new wrapper component that shows `<Landing />` for unauthenticated users and performs the role-based redirect for authenticated users.
- Remove the `/landing` route (or redirect it to `/` for backward compatibility).

### Implementation Approach

Update `RoleBasedRedirect` to render `<Landing />` inline when there's no authenticated user, instead of redirecting to a separate route. This keeps all the existing role-based logic intact:

```
/ (root)
  |-- Not signed in --> Show Landing page
  |-- Signed in, no org --> Redirect to /onboarding
  |-- Signed in, has org --> Redirect to tier-appropriate dashboard
```

### Files Summary

| File | Change |
|------|--------|
| `src/components/shared/RoleBasedRedirect.tsx` | Render `<Landing />` instead of redirecting to `/landing` |
| `src/App.tsx` | Remove `/landing` route (or make it redirect to `/`) |

