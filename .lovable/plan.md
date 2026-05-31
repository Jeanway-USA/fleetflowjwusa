# Sticky Bottom Action Bar for Driver Onboarding

Move the existing nav row inside the `<CardContent>` (lines 614–659 of `src/pages/DriverOnboarding.tsx`) into a fixed-position bar pinned to the viewport bottom, and add bottom padding to the scroll container so the document isn't hidden behind it.

## Scope

Single file: `src/pages/DriverOnboarding.tsx`. No logic, validation, or button-handler changes — just relocation + styling. `canContinue` already drives the disabled state and stays exactly as-is.

## Changes

### 1. Remove the in-card action row

Delete lines 614–659 (the `<div className="mt-6 flex items-center justify-between gap-2">…</div>` block) from inside `<CardContent>`. Also remove the small "Page X of Y" hint at lines 608–612 since it will move into the sticky bar for context.

### 2. Add bottom padding to the page wrapper

Change line 491 from:
```tsx
<div className="container max-w-4xl py-10">
```
to:
```tsx
<div className="container max-w-4xl py-10 pb-32">
```
(extra `pb-32` ≈ 8rem keeps the last paragraph clear of the ~72px sticky bar on every viewport.)

### 3. Insert the sticky footer

Just before the closing `</div>` of the outermost `<div className="min-h-screen ...">` (line 663), insert:

```tsx
<div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white dark:bg-background shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.08)]">
  <div className="container max-w-4xl flex items-center justify-between gap-3 py-3 px-4">
    {/* LEFT — Back / Previous Page */}
    {!isCredentialsStep && safeSubPageIndex > 0 ? (
      <Button
        variant="outline"
        onClick={() => {
          setCurrentSubPageIndex((i) => Math.max(0, i - 1));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        disabled={submitting}
      >
        Previous Page
      </Button>
    ) : (
      <Button
        variant="outline"
        onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
        disabled={stepIndex === 0 || submitting}
      >
        Back
      </Button>
    )}

    {/* CENTER — context label */}
    <div className="hidden sm:block text-xs text-muted-foreground">
      {isCredentialsStep
        ? `Step ${stepIndex + 1} of ${totalSteps}`
        : chunkCount > 1
          ? `Page ${safeSubPageIndex + 1} of ${chunkCount} · Step ${stepIndex + 1}/${totalSteps}`
          : `Step ${stepIndex + 1} of ${totalSteps}`}
    </div>

    {/* RIGHT — Next Page / Submit */}
    {!isCredentialsStep && !isLastSubPage ? (
      <Button
        onClick={() => {
          setCurrentSubPageIndex((i) => i + 1);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        disabled={submitting}
      >
        Next Page
      </Button>
    ) : (
      <Button onClick={handleContinue} disabled={!canContinue || submitting}>
        {submitting
          ? isCredentialsStep
            ? 'Saving…'
            : 'Submitting…'
          : isCredentialsStep
            ? 'Continue'
            : isLastTemplateStep
              ? 'Submit Document'
              : 'Continue'}
      </Button>
    )}
  </div>
</div>
```

Notes:
- `bg-white dark:bg-background` satisfies the "white background" requirement in light mode while still rendering correctly in dark mode.
- `border-t border-border` is the "crisp top border."
- Inner `container max-w-4xl` aligns the buttons with the document column on wide screens; the bar itself still spans full viewport width.
- The Submit button keeps `disabled={!canContinue || submitting}`, so all existing strict validations (filled inputs, captured signature, etc.) continue to gate it. Visually disabled state comes from the shadcn Button default.
- Label changed from `'Sign & Submit Document'` to `'Submit Document'` per requirement 4.

## Files

- **Edited**: `src/pages/DriverOnboarding.tsx`

## Verification

After edits, on `/onboarding`:
- Scroll a long document → footer stays pinned, last paragraph not hidden.
- Submit button greys out when signature missing or required inputs blank; activates once all are filled.
- Previous/Next Page work on multi-chunk documents; Back works on step 1+ credentials.
- Both light and dark themes render correctly.
