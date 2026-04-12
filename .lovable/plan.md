

## Fix Branding Images Not Displaying

### Root Cause
The Content Security Policy (CSP) in `index.html` restricts `img-src` to `'self' data: blob:` and a few map tile domains. Signed URLs for branding assets point to `https://iwivgqsihxicyptaoewm.supabase.co/storage/v1/object/sign/...`, which is blocked by the browser.

The uploads succeed, the signed URLs are generated correctly (verified via network requests), but the `<img>` tags are blocked from loading by CSP.

### Fix

**File: `index.html`** — Add the Supabase domain to the `img-src` directive:

Change the `img-src` portion of the CSP from:
```
img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://cdnjs.cloudflare.com https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev;
```
To:
```
img-src 'self' data: blob: https://iwivgqsihxicyptaoewm.supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://cdnjs.cloudflare.com https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev;
```

This is a one-line change. No other files need modification.

