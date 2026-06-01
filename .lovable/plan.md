## Problem

On `/auth/accept-invite`, the "Set Your Password" form only accepts one character per keystroke before losing focus. The user has to click the input again for every letter.

## Root cause

In `src/pages/AcceptInvite.tsx`, the `Shell` wrapper is declared **inside** the `AcceptInvite` component:

```tsx
const Shell = ({ children }) => ( ... );
```

Because `Shell` is recreated on every render, React sees a brand-new component type each time `password` or `confirmPassword` state changes. That unmounts the entire subtree (including the `<Input>`), remounts a fresh one, and the input loses focus after each keystroke — exactly the "one letter at a time" symptom.

`ResetPassword.tsx` does not have this bug because it inlines its JSX instead of wrapping it in an inner component.

## Fix

Move `Shell` out of the `AcceptInvite` function body so it's a stable component reference across renders.

- File: `src/pages/AcceptInvite.tsx`
- Extract `const Shell = ({ children }: { children: React.ReactNode }) => ( ... )` to module scope (above `export default function AcceptInvite`).
- It only uses `children` and static imports (`Helmet`, `logoIcon`, `textLogo`), so no props/refactor needed beyond the move.

No other files, styles, or behavior change. The token-acceptance flow, success/error states, and legacy set-password flow continue to render identically — they just stop remounting on each keystroke.

## Out of scope

- No changes to auth logic, Supabase calls, routing, or the `Input` component.
- No styling changes.
