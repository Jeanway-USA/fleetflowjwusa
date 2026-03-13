

## Plan: Welcome Modal + Tour Auto-Trigger with Database Persistence

### Overview
Create a "Welcome to the Beta" modal that auto-displays on first login. It offers "Start Quick Tour" (launches the product tour) or "Skip". Persist completion via a `has_completed_onboarding_tour` boolean on the `profiles` table so it only shows once.

### 1. Database Migration
Add column to profiles:
```sql
ALTER TABLE public.profiles 
ADD COLUMN has_completed_onboarding_tour BOOLEAN NOT NULL DEFAULT false;
```

### 2. New Component: `src/components/shared/WelcomeBetaModal.tsx`
- Dialog/modal with welcome copy, beta branding (Sparkles icon, gold gradient accents)
- Two buttons: **"Start Quick Tour"** (primary) and **"Skip"** (secondary/ghost)
- On "Start Quick Tour": close modal → mark profile as completed → call `onStartTour()` callback
- On "Skip": close modal → mark profile as completed
- Completion update: `supabase.from('profiles').update({ has_completed_onboarding_tour: true }).eq('user_id', userId)`

### 3. Modified: `src/components/layout/DashboardLayout.tsx`
- On mount (in `DashboardLayoutInner`), query the user's `has_completed_onboarding_tour` from profiles
- If `false` and user is authenticated and not demo mode, show `<WelcomeBetaModal>`
- Pass `tour.startTour` as the `onStartTour` callback so clicking "Start Quick Tour" immediately launches the existing product tour (using the BCO tour for the executive dashboard)
- The tour's own skip/complete handlers already persist via localStorage — we only need the DB flag for the modal

### 4. Modified: `src/hooks/useProductTour.ts`
- No changes needed — `startTour()` already works as a callback

### Files
| File | Action |
|------|--------|
| Migration SQL | Add `has_completed_onboarding_tour` to profiles |
| `src/components/shared/WelcomeBetaModal.tsx` | Create — welcome dialog |
| `src/components/layout/DashboardLayout.tsx` | Modify — query flag, render modal, wire tour start |

