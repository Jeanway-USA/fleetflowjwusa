

## Company Customization and Billing Settings

Add four new capabilities to the owner's Settings page: company name editing, color scheme customization, logo/banner uploads, and subscription billing information.

---

### 1. Database Changes

**Add branding columns to `organizations` table:**
- `primary_color` (text, default `'45 80% 45%'`) -- HSL value for the primary/accent color
- `logo_url` (text, nullable) -- path to uploaded logo in storage
- `banner_url` (text, nullable) -- path to uploaded banner in storage

**Create a `branding-assets` storage bucket** (private) for logo and banner uploads, with RLS policies allowing org members to read and owners to write.

No new tables needed -- billing/subscription data already lives in the `organizations` table (`subscription_tier`, `trial_ends_at`, `is_active`).

---

### 2. Settings Page -- New Tabs

Restructure the Settings page tabs from 3 to 5:

| Tab | Contents |
|-----|----------|
| Users and Roles | Existing user management (unchanged) |
| Company | Editable company name, timezone, date format (replaces current "General" tab's company card) |
| Branding | Color scheme picker (preset palettes + custom HSL), logo upload, banner upload with live previews |
| Appearance | Existing dark/light theme toggle (unchanged) |
| Billing | Subscription tier display, trial status/expiry, plan details, upgrade prompts |

---

### 3. Company Tab

- Pull current `name` from `organizations` table via `orgId`
- Editable input field with a "Save" button that updates `organizations.name`
- On save, call `refreshOrgData()` so the sidebar and header reflect the new name immediately
- Move timezone and date format selectors here from the old General tab
- Move the Driver Incentives card here as well

---

### 4. Branding Tab

**Color Scheme:**
- Offer 5-6 preset color palettes (Gold, Blue, Green, Red, Purple, Teal) displayed as clickable swatches
- Each palette sets the `--primary`, `--accent`, and `--ring` CSS variables
- Selected palette is saved to `organizations.primary_color`
- On load, the app reads the org's color and applies it via a style injection in `ThemeContext` or a new `BrandingProvider`

**Logo and Banner:**
- Upload components using the existing `DocumentUpload` pattern
- Files stored in the `branding-assets` bucket at path `{org_id}/logo.png` and `{org_id}/banner.png`
- Show current logo/banner previews with "Change" and "Remove" buttons
- Update `organizations.logo_url` / `organizations.banner_url` on upload
- The `AppSidebar` header reads these values and uses them instead of the hardcoded `JW_Banner` imports when available

---

### 5. Billing Tab

Display read-only subscription information pulled from the `organizations` table:
- Current plan (subscription tier) with a friendly label
- Trial status: active/expired, days remaining
- Account status (active/inactive)
- "Upgrade Plan" button linking to `/pricing`
- Created date

No Stripe integration needed at this stage -- this is informational display of existing data.

---

### 6. Dynamic Branding Application

**New context or extension of ThemeContext:**
- Fetch `primary_color`, `logo_url`, `banner_url` from the org record
- Inject the custom primary color as CSS custom properties on `document.documentElement`
- Provide `orgLogo` and `orgBanner` values to consuming components

**AppSidebar update:**
- Replace hardcoded `jwBannerLight` / `jwBannerDark` imports with dynamic values from the branding context
- Fall back to the default JW banners when no custom branding is set

---

### Technical Details

**Migration SQL:**
```sql
-- Add branding columns
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '45 80% 45%',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text;

-- Create branding assets bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding-assets', 'branding-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: org members can read their branding assets
CREATE POLICY "Org members can view branding assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'branding-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

-- Storage RLS: owners can upload branding assets
CREATE POLICY "Owners can upload branding assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'branding-assets'
    AND is_owner(auth.uid())
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

-- Storage RLS: owners can update/delete branding assets
CREATE POLICY "Owners can manage branding assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding-assets'
    AND is_owner(auth.uid())
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );
```

**Files to create:**
- `src/components/settings/CompanyTab.tsx` -- company name, timezone, date format, driver incentives
- `src/components/settings/BrandingTab.tsx` -- color picker, logo/banner uploads
- `src/components/settings/BillingTab.tsx` -- subscription info display

**Files to modify:**
- `src/pages/Settings.tsx` -- add new tabs, import new components
- `src/contexts/ThemeContext.tsx` -- inject org primary color as CSS variables
- `src/contexts/AuthContext.tsx` -- add `primaryColor`, `logoUrl`, `bannerUrl` to org data fetch
- `src/components/layout/AppSidebar.tsx` -- use dynamic logo/banner from context

