

## Stripe Trial Subscription Implementation

### Current State
- The checkout session creates a standard subscription without a trial period
- Users immediately start paid billing after checkout
- The webhook correctly handles `trialing` status but the checkout never creates trial subscriptions

### Solution
Add Stripe's built-in trial functionality to the checkout session. This allows users to:
1. Select a subscription tier
2. Start a free trial (14 days)
3. Automatically convert to paid after trial ends

---

### Changes Required

#### 1. Edge Function: `create-checkout-session/index.ts`
Add `subscription_data.trial_period_days` to the checkout session creation:

```typescript
subscription_data: {
  metadata: { org_id: orgId, tier },
  trial_period_days: 14,  // Add this line
},
```

This tells Stripe to start a 14-day trial before billing begins. Users can add payment method but won't be charged until trial ends.

#### 2. Frontend: `src/pages/Pricing.tsx`
Update button text to clarify trial flow for logged-in users:
- Change `"Subscribe Now"` → `"Start 14-Day Trial"`

This makes the CTA consistent whether the user is logged in or not.

#### 3. Frontend: `src/components/settings/BillingTab.tsx`
Add visual indicator when subscription is in `trialing` status to show:
- "Trial Active" badge
- Days remaining in trial
- Trial end date from `subscription_period_end`

---

### How It Works
1. User selects tier → Stripe Checkout opens
2. User enters payment info → Subscription created with `status: "trialing"`
3. Webhook receives `checkout.session.completed` → Updates org with `subscription_status: "trialing"`
4. After 14 days, Stripe auto-charges → Sends `customer.subscription.updated` with `status: "active"`
5. Webhook updates org status to `active`

---

### Files to Modify
| File | Change |
|------|--------|
| `supabase/functions/create-checkout-session/index.ts` | Add `trial_period_days: 14` to subscription_data |
| `src/pages/Pricing.tsx` | Update button text to "Start 14-Day Trial" |
| `src/components/settings/BillingTab.tsx` | Improve trial status display for Stripe-backed trials |

