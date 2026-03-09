

## Fix: Invited users should skip onboarding

### Root Cause
In `src/pages/Auth.tsx` line 124, after a successful signup, the code hardcodes `navigate('/onboarding')`. This happens regardless of whether the user was pre-invited and already has an `org_id` and role assigned.

### Solution
Change the post-signup navigation from `/onboarding` to `/`. The `RoleBasedRedirect` component at `/` already handles all cases correctly:
- User with `org_id` + roles → appropriate dashboard
- User without `org_id` → `/onboarding`

Also update the success toast to be generic (not "Let's set up your company").

### Changes

**`src/pages/Auth.tsx`** (line 123-124):
```tsx
// Before:
toast.success('Account created! Let\'s set up your company.');
navigate('/onboarding');

// After:
toast.success('Account created! Welcome aboard.');
navigate('/');
```

Single file, two-line change. The existing `RoleBasedRedirect` logic handles routing correctly for both invited and non-invited users.

