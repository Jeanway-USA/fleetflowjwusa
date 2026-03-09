
## Stripe Subscription Integration

### Overview
Full end-to-end Stripe billing: database migration → two edge functions → frontend checkout + billing portal. Prices are pulled dynamically from `subscription_plans` at runtime — no hardcoded Stripe Price IDs.

---

### Secrets Needed First
Before any code runs, the user must supply:
- `STRIPE_SECRET_KEY` — from Stripe Dashboard → Developers → API Keys
- `STRIPE_WEBHOOK_SECRET` — from Stripe Dashboard → Developers → Webhooks (after we create the webhook endpoint URL)

We'll request these via the secrets tool. The webhook endpoint URL will be:
`https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/stripe-webhook`

---

### 1. Database Migration
Add Stripe billing columns to `organizations`:

```sql
ALTER TABLE public.organizations
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN stripe_subscription_id text,
  ADD COLUMN subscription_status text DEFAULT 'trialing',
  ADD COLUMN subscription_period_end timestamptz;
```

No RLS changes needed — organizations already has policies; these columns are read by the existing owner-scoped select.

---

### 2. Edge Function: `create-checkout-session`

**File:** `supabase/functions/create-checkout-session/index.ts`

Flow:
1. Verify JWT → get `user_id` → look up `org_id` from profiles
2. Parse `{ tier, isAnnual, promoCode? }` from request body
3. Query `subscription_plans` for price: `base_price_monthly` or `base_price_annual`
4. Optionally query `promo_codes` for a matching active promo → apply discount to `unit_amount`
5. Create/get Stripe customer (upsert `stripe_customer_id` on org)
6. Call `stripe.checkout.sessions.create` with:
   - `price_data.unit_amount` = DB price in cents
   - `price_data.recurring.interval` = `'month'` or `'year'`
   - `allow_promotion_codes: true`
   - `client_reference_id` = `org_id`
   - `success_url` = `/settings?tab=billing&session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url` = `/pricing`
7. Return `{ url: session.url }`

Config: `verify_jwt = false` + manual JWT check in code.

---

### 3. Edge Function: `stripe-webhook`

**File:** `supabase/functions/stripe-webhook/index.ts`

Flow:
1. Verify Stripe signature using `STRIPE_WEBHOOK_SECRET`
2. Handle events:
   - `checkout.session.completed` → extract `client_reference_id` (org_id), `stripe_customer_id`, `subscription.id` → update org
   - `customer.subscription.updated` → look up org by `stripe_customer_id` → update `subscription_status`, `subscription_period_end`, and `subscription_tier` (from metadata)
   - `customer.subscription.deleted` → set `subscription_status = 'canceled'`, `is_active = false`
3. Uses service role key to bypass RLS for org updates

Config: `verify_jwt = false` — signature verified manually.

---

### 4. Edge Function: `create-portal-session`

**File:** `supabase/functions/create-portal-session/index.ts`

Simple: verify JWT → get org → use `org.stripe_customer_id` → call `stripe.billingPortal.sessions.create` → return `{ url }`.

---

### 5. Frontend Changes

**`src/pages/Pricing.tsx`**
- Replace `onClick={() => navigate('/auth?tier=...')}` with a handler that:
  - If user is logged in → call `create-checkout-session` edge function → `window.location.href = url`
  - If not logged in → `navigate('/auth?tier=...')` (existing behavior)
- Add loading state per card button

**`src/components/settings/BillingTab.tsx`**
- Query the updated `organizations` table for new Stripe fields (`subscription_status`, `subscription_period_end`, `stripe_subscription_id`)
- Show subscription status badge (trialing / active / canceled / past_due)
- Show subscription renewal date from `subscription_period_end`
- Replace "View Plans & Upgrade" button with a **"Subscribe / Upgrade"** button that calls `create-checkout-session`
- Add **"Manage Billing"** button (visible when `stripe_customer_id` exists) → calls `create-portal-session` → `window.location.href`

**`src/App.tsx`**
- Add lazy route for `/checkout-success` page showing "Payment successful" with a redirect back to settings

---

### File Summary

| File | Action |
|---|---|
| `supabase/migrations/[timestamp]_stripe_billing.sql` | Add 4 Stripe columns to organizations |
| `supabase/functions/create-checkout-session/index.ts` | New — dynamic price checkout |
| `supabase/functions/create-portal-session/index.ts` | New — Stripe Customer Portal |
| `supabase/functions/stripe-webhook/index.ts` | New — webhook handler |
| `supabase/config.toml` | Add 3 new function entries (verify_jwt = false) |
| `src/pages/Pricing.tsx` | Update CTA buttons to trigger checkout |
| `src/components/settings/BillingTab.tsx` | Add Stripe status + Manage Billing button |
| `src/pages/CheckoutSuccess.tsx` | New — success landing page |
| `src/App.tsx` | Add /checkout-success route |

---

### Implementation Note on Promo Codes
The `subscription_plans` table has `base_price_monthly`/`base_price_annual`. The `promo_codes` table has `discount_percentage` and `discount_amount`. The edge function applies the discount server-side to `unit_amount` before passing to Stripe, AND `allow_promotion_codes: true` is set so users can also enter Stripe-native promo codes at the hosted checkout page — both approaches work in parallel.

---

### Pre-Implementation: Secrets Required
Before writing any code, we need to collect:
1. `STRIPE_SECRET_KEY` (live or test key from Stripe Dashboard)
2. `STRIPE_WEBHOOK_SECRET` (from Stripe Webhooks after registering endpoint URL)

**The first step is to enable Stripe and collect the secret key.**
