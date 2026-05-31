## Add "Fields Remaining" tracker to sticky footer

**File:** `src/pages/DriverOnboarding.tsx` only.

### 1. Compute remaining-fields count

Just below the existing `canContinue` block (~line 197), add a `useMemo` (or plain computation) that, **for the currently visible chunk only**, builds a list of required fields and counts how many are still invalid.

Detection mirrors the existing `needs*` logic but scoped to `currentChunk` so the count reflects the page the driver is looking at:

```ts
const fieldsRemaining = useMemo(() => {
  if (isCredentialsStep || !currentTemplate) return 0;
  const c = currentChunk;
  let n = 0;
  if (/\{\{\s*driver_address\s*\}\}/.test(c) && !currentState.driverAddress.trim()) n++;
  if (/\{\{\s*cdl_number\s*\}\}/.test(c)    && !currentState.cdlNumber.trim()) n++;
  if (/\{\{\s*ssn\s*\}\}/.test(c)           && ssnDigits.length !== 9) n++;
  if (/\{\{\s*email\s*\}\}/.test(c)         && !emailValid) n++;
  if (/\{\{\s*bank_name\s*\}\}/.test(c)         && !currentState.bankName.trim()) n++;
  if (/\{\{\s*bank_account_type\s*\}\}/.test(c) && currentState.bankAccountType === '') n++;
  if (/\{\{\s*routing_number\s*\}\}/.test(c)    && currentState.routingNumber.length !== 9) n++;
  if (/\{\{\s*account_number\s*\}\}/.test(c)    && currentState.accountNumber.length < 4) n++;
  if (/\{\{\s*file_upload\s*\}\}/.test(c)       && !currentState.attachment) n++;
  if (/\{\{\s*driver_signature\s*\}\}/.test(c)  && !isValidSignatureDataUrl(currentState.signature)) n++;
  return n;
}, [isCredentialsStep, currentTemplate, currentChunk, currentState, ssnDigits, emailValid]);
```

Because `currentState` is driven by the existing `onChange` handlers (`updateCurrent`), the count re-renders in real-time as the driver types or signs — no extra onBlur wiring needed.

### 2. Render in the sticky footer

In the sticky footer (~lines 613–668), replace the existing `hidden sm:block` step/page label with a two-line block that keeps the page context **and** shows the tracker. Hide the tracker on the credentials step (no template fields there).

```tsx
<div className="hidden sm:flex flex-col items-center text-xs leading-tight">
  <span className="text-muted-foreground">
    {isCredentialsStep
      ? `Step ${stepIndex + 1} of ${totalSteps}`
      : chunkCount > 1
        ? `Page ${safeSubPageIndex + 1} of ${chunkCount} · Step ${stepIndex + 1}/${totalSteps}`
        : `Step ${stepIndex + 1} of ${totalSteps}`}
  </span>
  {!isCredentialsStep && (
    fieldsRemaining > 0 ? (
      <span className="text-orange-600 dark:text-orange-400 font-medium">
        Fields remaining: {fieldsRemaining}
      </span>
    ) : (
      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
        Document ready to sign!
      </span>
    )
  )}
</div>
```

No other logic, validation, or button behavior changes — `canContinue` continues to gate the Submit button exactly as before.