

## Plan: Replace Hardcoded Prices with Dynamic Database Prices

### Problem
The Landing page has hardcoded `$49/mo` (Solo BCO) and `$149/mo` (Fleet Owner) prices in the pricing section. These should come from the `subscription_plans` table to stay in sync with what's configured in the admin dashboard.

### Changes — `src/pages/Landing.tsx`

**1. Add state and fetch prices on mount**
- Add `useEffect` import
- Add `prices` state (`Record<string, number>`) and `pricesLoading` state
- Fetch from `subscription_plans` table (same pattern as `/pricing` page) on mount
- Map `tier → base_price_monthly`

**2. Replace hardcoded `$49` (line 245) with dynamic value**
- Show `Skeleton` while loading, then `${prices['solo_bco'] ?? '—'}` with line-through styling

**3. Replace hardcoded `$149` (line 316) with dynamic value**
- Show `Skeleton` while loading, then `${prices['fleet_owner'] ?? '—'}` with line-through styling

**4. Import additions**
- Add `useEffect` from React
- Add `Skeleton` from `@/components/ui/skeleton`

### No other files need changes
The `/pricing` page already fetches dynamically. No other hardcoded prices exist elsewhere.

