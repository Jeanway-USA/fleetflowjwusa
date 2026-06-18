# Fix: First sign-in attempt fails on mobile

## Root cause
Mobile browsers (especially iOS Safari and Chrome on Android) fill saved credentials into the email/password inputs *after* React's controlled `value` has been hydrated. The first tap on **Sign In** submits the form using React state, which still holds the **previous (often empty)** values. Supabase correctly returns `Invalid login credentials`, the toast flashes, the user taps again, and by then state has caught up — so it "works after a few tries."

The Supabase auth logs confirm this: when a real request lands, it returns `200` in ~330ms. There is no backend or rate-limit issue.

A smaller secondary bug: if `signInWithPassword` throws (mobile network blip), `setFormLoading(false)` in `Auth.tsx` is never reached, leaving the button stuck on "Signing in…" until the next render.

## Changes (frontend only — `src/pages/Auth.tsx`)

1. **Read credentials from the form, not from React state**, on submit. Use `new FormData(e.currentTarget)` (or `e.currentTarget.elements`) in `handleSignIn`, `handleSignUp`, and `handleForgotPassword` to capture the *actual* field values at submit time. Keep the controlled state for UX (toggling buttons, prefilling forgot-password), but trust the DOM on submit.
2. **Add `autoComplete` hints** so browsers fill correctly the first time:
   - Sign in email → `autoComplete="username"` (or `"email"`), password → `"current-password"`.
   - Sign up email → `"email"`, password → `"new-password"`, first/last name → `"given-name"` / `"family-name"`.
3. **Wrap the auth calls in try/catch/finally** so `setFormLoading(false)` always runs even if the SDK throws (network failure). On catch, show a generic "Couldn't reach the server, please try again" toast.
4. **Re-sync state from the DOM on focus/blur** of the inputs is not needed once we read from `FormData` — skipping.

## Out of scope
- No changes to `AuthContext.signIn`, Supabase config, RLS, or edge functions.
- No changes to the forgot-password or reset-password flows beyond the same `FormData` + try/catch hardening on the forgot form.
- No UI/visual redesign.

## Verification
- Open `/auth` on a mobile device with saved credentials, tap the email field, accept autofill, tap **Sign In** once — should sign in on the first tap.
- Toggle airplane mode mid-submit — button should re-enable and show an error toast instead of getting stuck.
