## Problem

The onboarding wizard saves the W-2 direct deposit PDF under `document_type = 'direct_deposit_form'` (see `src/pages/DriverOnboarding.tsx` line 625), but the "outstanding docs" check in `src/lib/onboarding/outstanding.ts` looks for `document_type = 'direct_deposit'` in its `BUILTIN_W2` list.

Result: the signed row exists (admin view shows the completed doc), the onboarding page correctly says everything is done (it checks `direct_deposit_form`), but `fetchOutstandingTemplates` never finds a match and keeps reporting 1 outstanding built-in — driving the red "Action Required / Complete Documents" banner on the driver dashboard and the "Outstanding documents (1)" card in admin.

## Fix

In `src/lib/onboarding/outstanding.ts`, change the W-2 built-in entry from:

```ts
{ document_type: 'direct_deposit', name: 'Direct Deposit Authorization' }
```

to:

```ts
{ document_type: 'direct_deposit_form', name: 'Direct Deposit Authorization' }
```

That's the actual `document_type` written to `driver_signed_documents` by the onboarding flow, so the "already signed" set will match and the phantom outstanding item disappears for both the driver banner and the admin card.

No other changes: onboarding logic, DB, and admin labels (`SignedOnboardingDocuments.tsx` already maps both keys to "Direct Deposit Authorization") stay as-is.

## Scope

- Edit only `src/lib/onboarding/outstanding.ts` (one string).
