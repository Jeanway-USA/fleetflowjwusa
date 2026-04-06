

## Add Content Security Policy (CSP) to index.html

### What This Does
Adds a `<meta http-equiv="Content-Security-Policy">` tag that restricts which domains can serve scripts, styles, images, and network connections — blocking unauthorized third-party code injection (XSS).

### External Domains Identified in the Codebase

| Domain | Used For | CSP Directive |
|--------|----------|---------------|
| `iwivgqsihxicyptaoewm.supabase.co` | Backend API + Auth | `connect-src`, `script-src` |
| `*.tile.openstreetmap.org` | Map tiles (Leaflet) | `img-src` |
| `*.basemaps.cartocdn.com` | CARTO map tiles (IFTA) | `img-src` |
| `cdnjs.cloudflare.com` | Leaflet marker icons | `img-src` |
| `nominatim.openstreetmap.org` | Geocoding API | `connect-src` |
| `router.project-osrm.org` | Routing API | `connect-src` |
| `pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev` | OG preview image | `img-src` |
| `fonts.googleapis.com` / `fonts.gstatic.com` | Google Fonts (if added later) | `style-src` / `font-src` |

### Change

**`index.html`** — Add CSP meta tag after line 5:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://cdnjs.cloudflare.com https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev;
  connect-src 'self' https://iwivgqsihxicyptaoewm.supabase.co https://nominatim.openstreetmap.org https://router.project-osrm.org;
  worker-src 'self' blob:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
">
```

### Key Decisions
- **`'unsafe-inline'` for styles only** — Required because Tailwind and component libraries inject inline styles. Scripts do NOT get `'unsafe-inline'`.
- **`blob:` in img-src and worker-src** — Needed for Leaflet tile rendering and the PWA service worker.
- **`data:` in img-src** — Used by Leaflet and inline SVG icons.
- **`frame-src 'none'`** and **`object-src 'none'`** — Blocks iframe and plugin injection vectors.
- **Google Fonts pre-allowed** — Even if not currently imported, this avoids breakage if added later. Can be removed for stricter policy.

### Files
| File | Change |
|------|--------|
| `index.html` | Add CSP meta tag in `<head>` |

