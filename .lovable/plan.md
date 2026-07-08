## Problem

Clicking the copy button next to any Document Template variable/token shows an "Unable to copy" toast. This happens because `navigator.clipboard.writeText()` in `DocumentTemplatesPanel.tsx` (line 272) throws when the app runs inside the Lovable preview iframe — iframes without an explicit `clipboard-write` permission-policy (or non-secure contexts) reject the Async Clipboard API.

## Fix

Update `copyToken` in `src/components/settings/DocumentTemplatesPanel.tsx` to gracefully fall back to a legacy `document.execCommand('copy')` path when the async API is unavailable or rejected.

Approach:
1. Try `navigator.clipboard.writeText(token)` first (works in normal browser tabs and published site).
2. On failure (or when `navigator.clipboard` is undefined), create a hidden `<textarea>`, set its value to the token, select it, run `document.execCommand('copy')`, and remove it.
3. Only show the "Unable to copy" error toast if both paths fail.
4. Keep the existing success toast `Copied {token}`.

No other files or behavior change.
