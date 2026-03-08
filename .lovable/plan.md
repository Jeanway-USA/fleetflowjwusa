

## Enhance BrandingTab as White-Label Engine

### Current State
- **BrandingTab** already has color presets, logo upload, and banner upload — all saved to `organizations` table
- **ThemeContext** has `applyBrandColor()` but it's **never called anywhere** — brand colors are never actually injected
- **AppSidebar** uses `bannerUrl` for the header image but doesn't use `logoUrl`
- No custom color input exists (only 6 presets)

### Changes

**1. `src/contexts/ThemeContext.tsx`** — Wire up brand color injection
- Accept `brandColor` as a prop or add a `useEffect` that watches for color changes
- Since ThemeProvider wraps AuthProvider, we can't use `useAuth` inside it. Instead, create a small **`BrandColorInjector`** child component that sits inside both providers, calls `useAuth().primaryColor` and `useTheme().applyBrandColor` in a `useEffect`
- Fix `applyBrandColor` to properly apply dark-mode-adjusted HSL and also clear/reset when `null` is passed (graceful fallback)

**2. `src/App.tsx`** — Add `<BrandColorInjector />` inside `<AuthProvider>`
- A tiny component that bridges AuthContext → ThemeContext

**3. `src/components/settings/BrandingTab.tsx`** — Add custom color picker
- Add a native `<input type="color">` alongside the presets for full custom color selection
- Convert hex ↔ HSL so the native picker works with the existing HSL storage format
- Keep existing presets as quick-select shortcuts
- No new dependency needed (native HTML color input)

**4. `src/components/layout/AppSidebar.tsx`** — Use org logo
- Already fetches `bannerUrl` with `useSignedUrl`. Also fetch `logoUrl` from `useAuth()`
- Replace the banner `<img>` with the org logo when available, falling back to the default JW banner
- The logo replaces the banner in the sidebar header; if no logo is set, keep existing default banner

### Fallback Behavior
- If `primaryColor` is `null`: CSS custom properties are not overridden → default theme colors apply
- If `logoUrl` is `null`: default JW banner images are shown (existing behavior)
- `applyBrandColor(null)` will remove inline style overrides to restore defaults

### Files Modified
| File | Action |
|---|---|
| `src/contexts/ThemeContext.tsx` | Fix `applyBrandColor` to support reset/null, clean up dark mode logic |
| `src/components/shared/BrandColorInjector.tsx` | New — bridges AuthContext primaryColor → ThemeContext CSS injection |
| `src/App.tsx` | Add `<BrandColorInjector />` inside AuthProvider |
| `src/components/settings/BrandingTab.tsx` | Add native color picker input alongside presets |
| `src/components/layout/AppSidebar.tsx` | Use org logo in sidebar header with fallback |

