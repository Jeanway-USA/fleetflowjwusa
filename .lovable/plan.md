## Goal

Owners (only) can view, preview, and download signed onboarding PDFs from a driver's row on `src/pages/Drivers.tsx`.

## Changes

### 1. New component `src/components/drivers/SignedOnboardingDocuments.tsx`
- Props: `driverId: string`, `driverName: string`.
- Internally guards on `useAuth().isOwner` — renders `null` if not an owner (defense-in-depth on top of menu gating).
- Fetches `driver_signed_documents` for that driver with `useQuery`, ordered by `signed_at desc`. The new RLS policy already restricts to owner/safety/payroll within the org.
- Renders a list of cards with: document type label, signed date.
- Action buttons per row:
  - **Preview** — calls `supabase.storage.from('signed-documents').createSignedUrl(file_path, 300)` then `window.open(url, '_blank')`.
  - **Download** — same signed URL, triggers a hidden anchor with `download` attribute.
- Empty state: "No signed onboarding documents yet."
- Loading skeleton.

### 2. `src/pages/Drivers.tsx` integration
- Add a new dropdown menu item **"Signed Documents"** rendered only when `isOwner`, with a `ShieldCheck` icon, that opens a new dialog with `signedDocsDriver` state (separate from the existing generic Documents dialog so the two surfaces don't conflict).
- New `<Dialog>` near the existing documents dialog: title "Signed Onboarding Documents — {first} {last}", content is `<SignedOnboardingDocuments driverId={...} driverName={...} />`.
- All other behavior on Drivers.tsx unchanged.

### 3. RBAC
- Owner-only gating happens in three places:
  1. Dropdown menu item wrapped in `{isOwner && ...}`.
  2. The dialog only opens via that menu item.
  3. The component itself returns `null` for non-owners.
- Server-side, the existing RLS policy `Owner safety payroll can view org signed documents` enforces actual data isolation; the UI restriction is the owner-only product requirement.

## Out of scope
- Re-issuing or invalidating signed documents.
- Bulk actions or filters.
- Showing this section on the driver self-view.
