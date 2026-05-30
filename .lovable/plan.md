## Objective
Restructure `src/pages/Settings.tsx` into a two-tab layout using shadcn/ui Tabs, grouping all existing settings under a "General" tab and adding a new "Onboarding & Documents" tab as the foundation for future document-template and new-hire configuration.

## Plan

### 1. Top-level tab structure
- Wrap the page content in a shadcn/ui `<Tabs>` component with two top-level triggers: **"General"** and **"Onboarding & Documents"**.
- Use a `<Settings className="h-4 w-4" />` (or `Sliders`) icon for "General" and a `<FileText className="h-4 w-4" />` icon for "Onboarding & Documents".

### 2. "General" tab (`value="general"`)
- Move the **entire existing tab interface** (Team, Company, Branding, Appearance, Billing, Storage) into `TabsContent value="general"`.
- The existing 6 sub-tabs remain nested inside "General" so current UX is preserved.
- Update the `<Tabs defaultValue="...">` inside "General" so it still defaults to `users`.

### 3. "Onboarding & Documents" tab (`value="onboarding"`)
- Create a new `TabsContent value="onboarding"` containing a single descriptive card.
- Card header:
  - Title: "Onboarding & Documents"
  - Description: "Manage automated documents and new hire flows for your organization. This section will let you configure document templates, track driver onboarding status, and enforce required signatures before drivers become active."
- Use existing `Card`, `CardHeader`, `CardTitle`, `CardDescription` components.
- Style with existing Tailwind semantic tokens (no hard-coded colors).

### 4. Non-owner view
- The restricted non-owner view (theme toggle + "Admin Settings Restricted" card) stays unchanged; it does not need the top-level tabs because non-owners only see personal preferences.

### 5. Responsive layout
- `TabsList` uses `className="mb-6 flex-wrap"` so tabs wrap on narrow viewports.
- Both top-level tab panels use `w-full` and spacing utilities for clean stacking.

## Files to modify
- `src/pages/Settings.tsx` — restructure tabs, add new tab content, import `FileText` (and `Settings` or `Sliders`) from `lucide-react`.

## Out of scope
- No changes to settings tab components (`CompanyTab`, `BrandingTab`, etc.).
- No database or backend changes.
- No functional onboarding/document management UI yet — only the descriptive placeholder header.