

## Remove JeanWay USA Branding, Replace with "Fleet Flow TMS by JeanWayUSA" Text

### Overview
Remove all JW_Banner/JW_Icon image imports and replace them with a styled text logo "Fleet Flow TMS" with a "by JeanWayUSA" subtitle. Keep the email addresses and super admin checks unchanged (those are functional, not branding).

### Changes

**1. `src/components/layout/AppSidebar.tsx`**
- Remove `jwBannerLight` and `jwBannerDark` imports (lines 28-29)
- Update `defaultBannerSrc` logic (line 170) — instead of falling back to JW images, fall back to `null`
- Replace the `<img>` tag at line 293 with a text-based logo component:
  - If `signedBannerUrl || signedLogoUrl` exists → show org banner image as before
  - Otherwise → show styled text: "Fleet Flow TMS" in bold gradient-gold + smaller "by JeanWayUSA" below
- Update alt text from "JeanWay USA" to "Fleet Flow TMS"

**2. `src/pages/Auth.tsx`**
- Remove `jwBannerLight`/`jwBannerDark` imports
- Replace all `<img src={bannerSrc} alt="JeanWay USA" ...>` with a styled text block: "Fleet Flow TMS" heading + "by JeanWayUSA" subtitle

**3. `src/pages/ResetPassword.tsx`**
- Same treatment as Auth.tsx — remove image imports, replace all 3 `<img>` instances with text logo

**4. `src/pages/Onboarding.tsx`**
- Remove `jwBannerLight`/`jwBannerDark` imports
- Replace the `<img>` banner with styled text logo

**5. `src/pages/PendingAccess.tsx`**
- Remove `bannerLogo` import
- Replace `<img>` with text logo

**6. `src/pages/Landing.tsx`**
- Already uses text "FleetFlow TMS" — update to "Fleet Flow TMS" with "by JeanWayUSA" styling

**7. `src/pages/Pricing.tsx`**
- Update text "FleetFlow TMS" to "Fleet Flow TMS by JeanWayUSA"

**8. `src/index.css`**
- Update comment from "JeanWay USA Design System" to "Fleet Flow TMS Design System"

**9. `supabase/functions/invite-user/index.ts`**
- Update email branding from "JeanWay USA" to "Fleet Flow TMS by JeanWayUSA" in HTML template, subject line, and from name

**10. `src/pages/AccountDeactivated.tsx`**
- Update support email domain if referenced

### Text Logo Component Pattern
Reused across all pages — a simple inline block:
```tsx
<div className="text-center">
  <h1 className="text-2xl font-extrabold text-gradient-gold tracking-tight">Fleet Flow TMS</h1>
  <p className="text-xs text-muted-foreground mt-0.5">by JeanWayUSA</p>
</div>
```

Sized appropriately per context (sidebar uses smaller text, auth pages use larger).

### Files NOT Changed
- `src/assets/JW_Banner.png` etc. — left in place (no harm, will be unused)
- Super admin email lists — functional, not branding
- `src/contexts/ThemeContext.tsx` — localStorage key `jeanway-theme` is internal, not user-facing
- Migration SQL files — historical, not editable

