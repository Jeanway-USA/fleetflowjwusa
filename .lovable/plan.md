

# Step-by-Step Onboarding Wizard

## Overview

Replace the current single-form signup experience in `Auth.tsx` with a multi-step onboarding wizard that guides new users through account creation, organization setup, tier selection, and optionally creating their first load. The wizard launches after signup and lives on a new `/onboarding` route.

## User Flow

```text
Auth (Sign Up tab)
  |-- Creates user account only (email + password + name)
  |-- Redirects to /onboarding
  v
Step 1: Company Setup
  |-- Company name, MC/DOT number (optional)
  v
Step 2: Choose Your Plan
  |-- Visual tier cards (reuses pricing data)
  |-- Highlights current selection
  v
Step 3: Create Your First Load (optional)
  |-- Origin, destination, rate, pickup date
  |-- "Skip for now" option
  v
Done: Confetti + redirect to dashboard
```

## Technical Changes

### 1. New File: `src/pages/Onboarding.tsx`

A multi-step wizard component with 3 steps:

- **Step 1 -- Company Setup**: Text inputs for company name (required) and optional MC/DOT number. On "Next", creates the `organizations` row, links the user's profile via `org_id`, and inserts the `owner` role into `user_roles`.
- **Step 2 -- Plan Selection**: Renders the 4 tier cards (Solo BCO, Fleet Owner, Agency, All-in-One) as selectable cards with feature highlights. On "Next", updates `organizations.subscription_tier`.
- **Step 3 -- First Load (Optional)**: A simplified load form with origin, destination, rate, and pickup date. "Skip" button bypasses this step. On submit, inserts into `fleet_loads` with the user's `org_id`.
- **Complete**: Fires `canvas-confetti`, calls `refreshOrgData()` on `AuthContext`, then redirects to `/` (which triggers `RoleBasedRedirect` for tier-aware landing).

Each step shows a progress bar at the top and back/next navigation at the bottom. State is held in component-level `useState` (no persistence needed since the wizard is completed in one session).

### 2. Modify: `src/pages/Auth.tsx`

Simplify the Sign Up tab:
- Remove the company name input, tier selector, and all org/role creation logic from `handleSignUp`.
- After successful `signUp()`, redirect to `/onboarding` instead of `/`.
- The sign-up form becomes: First Name, Last Name, Email, Password only.

### 3. Modify: `src/App.tsx`

- Import the new `Onboarding` page.
- Add route: `<Route path="/onboarding" element={<Onboarding />} />` as a semi-protected route (requires auth but no role check, since the user won't have a role yet).

### 4. Modify: `src/components/shared/RoleBasedRedirect.tsx`

- Before the "no roles" redirect to `/pending-access`, check if the user has no `org_id` in their profile. If so, redirect to `/onboarding` instead. This handles the case where a user signs up but closes the browser before completing onboarding.

### 5. Modify: `src/contexts/AuthContext.tsx`

- Expose `orgId` loading state so the onboarding redirect logic can distinguish "no org yet" from "org exists but no role assigned."
- The existing `refreshOrgData` function is already available and will be called at the end of onboarding.

## Validation

- Company name: required, trimmed, max 100 characters (zod).
- Tier selection: required (defaults to `solo_bco`).
- Load fields (if not skipped): origin and destination required (max 200 chars), rate must be a positive number, pickup date required and must be today or later.

## Files Summary

| File | Change |
|------|--------|
| `src/pages/Onboarding.tsx` | **New** -- Multi-step wizard (company, tier, first load) |
| `src/pages/Auth.tsx` | Simplify signup form, redirect to `/onboarding` |
| `src/App.tsx` | Add `/onboarding` route |
| `src/components/shared/RoleBasedRedirect.tsx` | Redirect org-less users to `/onboarding` |

No database migrations required -- all tables (`organizations`, `profiles`, `user_roles`, `fleet_loads`) already exist with the needed columns and RLS policies.

