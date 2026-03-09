

## Fix: Sign Out Not Working on Account Deactivated Page

### Root Cause
The `/account-deactivated` page is a public route (no `ProtectedRoute` wrapper). When `signOut()` clears auth state, there's nothing to redirect the user away — they stay stuck on the page. Additionally, after account deletion, `supabase.auth.signOut()` fails with 403 since the user no longer exists in auth, but no navigation occurs.

### Changes

#### `src/pages/AccountDeactivated.tsx`

1. **Sign Out button**: Navigate to `/` after signing out
```tsx
const handleSignOut = async () => {
  await signOut();
  navigate('/');
};
// Button onClick={handleSignOut}
```

2. **Delete account handler**: After successful deletion, clear local storage and navigate to `/` instead of relying on `signOut()` (which will fail since user is deleted):
```tsx
const handleDeleteAccount = async () => {
  // ... existing invoke logic ...
  toast.success('Your account has been deleted.');
  // Don't call signOut() — user is already deleted from auth
  // Just clear local session and redirect
  localStorage.clear();
  navigate('/');
};
```

### Files to modify
| File | Change |
|------|--------|
| `src/pages/AccountDeactivated.tsx` | Add navigate('/') after signOut; handle post-delete redirect without signOut |

