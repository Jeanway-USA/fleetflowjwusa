

## Clickjacking Protection for index.html

### Problem
The site can potentially be embedded in a hostile `<iframe>` on another domain, enabling clickjacking attacks.

### Important Note
`frame-ancestors` is **not supported** in `<meta>` CSP tags — it only works via HTTP headers. However, we already have `frame-src 'none'` which prevents *our* site from loading external iframes. For clickjacking defense via meta tag, the frame-busting script is the primary mechanism. We can still document this limitation.

### Changes — `index.html`

1. **Add frame-busting script** at the very top of `<head>` (after `<meta charset>`), before any other tags:
```html
<script>
  if (window.top !== window.self) { window.top.location = window.self.location; }
</script>
```
This runs immediately and breaks out of any iframe. It must come before the CSP meta tag.

2. **Update CSP meta tag** — add `frame-ancestors 'none'` to the policy string. While browsers ignore `frame-ancestors` in meta CSP, it documents intent and will work if the policy is later moved to an HTTP header.

3. **Adjust `script-src`** — the inline frame-busting script requires `'unsafe-inline'` in `script-src`, OR we use a `nonce`/`hash`. Since adding `'unsafe-inline'` to scripts weakens XSS protection, we'll use a **SHA-256 hash** of the exact snippet to keep the policy strict.

### No Conflicts
- Supabase auth uses redirects (not iframes) — unaffected.
- No dashboard component uses self-embedding iframes (`frame-src` is already `'none'`).
- The Lovable preview iframe is handled by the SW guard in `main.tsx` which unregisters service workers — the frame-busting script will cause the preview to navigate to top, but this is acceptable since the published site is the target.

### Files
| File | Change |
|------|--------|
| `index.html` | Add frame-busting script + update CSP with `frame-ancestors 'none'` and script hash |

