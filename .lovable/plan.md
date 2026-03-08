

## Make Pricing Page Dynamic from Database

### Problem
The Pricing page has hardcoded prices ($49, $149, $99, $199) that don't match the values set in the super admin dashboard (Solo BCO: $20/mo, Fleet Owner: $50/mo, Agency: $35/mo, All-in-One: $75/mo).

### Current DB Prices (from `subscription_plans` table)
| Tier | Monthly | Annual |
|---|---|---|
| Solo BCO | $20 | $200 |
| Fleet Owner | $50 | $500 |
| Agency | $35 | $350 |
| All-in-One | $75 | $750 |

### Fix
Update `src/pages/Pricing.tsx` to fetch prices from the `subscription_plans` table at runtime instead of using hardcoded values. The table has public read RLS, so no auth is needed.

- Add a `useEffect` + `useState` to fetch `subscription_plans` on mount
- Replace hardcoded `price` fields with the fetched `base_price_monthly` values
- Also add a monthly/annual toggle that switches between `base_price_monthly` and `base_price_annual`
- Keep the static feature lists, icons, taglines, etc. as-is (those aren't in the DB)
- Show a loading skeleton while fetching

### Files Modified
| File | Action |
|---|---|
| `src/pages/Pricing.tsx` | Fetch prices from `subscription_plans` table dynamically |

