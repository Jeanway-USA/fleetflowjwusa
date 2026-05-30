# Driver onboarding with dynamic document templates

Create a new driver-facing page that fetches active `document_templates` from the database and renders them as interactive signing steps. The existing owner `Onboarding.tsx` is not touched.

## New files

### `src/components/onboarding/DocumentTemplateRenderer.tsx`
- Props: `content: string`, `driverAddress: string`, `onDriverAddressChange(v)`, `signature: string | null`, `onSignatureCapture(dataUrl)`.
- Pure renderer that walks the template string with a single regex (`/(\{\{\s*(today_date|company_address|driver_address|owner_signature|driver_signature)\s*\}\})/g`) and splits the content into ordered nodes.
- For each match it emits:
  - `{{today_date}}` → today formatted via `format(new Date(), 'MMMM d, yyyy')`.
  - `{{company_address}}` → literal `"4700 Diplomacy Rd, Fort Worth, TX 76155"`.
  - `{{owner_signature}}` → dashed-border block with text "Owner Signature Pending" (muted).
  - `{{driver_address}}` → inline `<Input>` bound to `driverAddress` (controlled).
  - `{{driver_signature}}` → block-level `<SignaturePad onSignatureCapture={...} />`; once captured, replace with the rendered PNG inside a bordered card.
- Plain prose between tags is rendered with whitespace preserved (`whitespace-pre-wrap`), so the layout flows naturally and unknown tags pass through verbatim.

### `src/pages/DriverOnboarding.tsx`
- New page, no `DashboardLayout` (matches Page Layout core rule). Container with a Card + `Progress` bar.
- Loads the driver's `orgId` from `useAuth` and queries:
  ```ts
  supabase
    .from('document_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('document_type', ['driver_agreement', 'direct_deposit'])
    .order('document_type');
  ```
  Sort client-side so `driver_agreement` precedes `direct_deposit`.
- Local state per template (keyed by `template.id`): `{ driverAddress: string, signature: string | null }`.
- Stepper: one document per step. "Continue" disabled until that step's `signature` is captured (and `driverAddress` non-empty if the template contains `{{driver_address}}`).
- Final step "Submit": inserts one row per template into a new `driver_document_signatures` table — **out of scope for this task**, so for now just toast "Documents submitted" and redirect to `/driver` (TODO comment noting future persistence step).
- Empty state: if no active templates exist, show "No documents to sign — contact your dispatcher" with a back link.

### `src/App.tsx`
- Add lazy import + route:
  ```tsx
  const DriverOnboarding = lazy(() => import('./pages/DriverOnboarding'));
  <Route
    path="/driver/onboarding"
    element={
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverOnboarding />
      </ProtectedRoute>
    }
  />
  ```

## Out of scope (call out, do not build)

- Persisting signed documents (no `driver_document_signatures` table yet).
- Auto-redirecting drivers to `/driver/onboarding` after invite acceptance.
- PDF generation of the signed agreement.
- Owner-side signing of `{{owner_signature}}` (placeholder only, per spec).
