

## Plan: Independent Mode Features — Broker CRM, Invoicing, Super Admin Override

### Overview
This plan adds four capabilities: (1) Super Admin can view/override org TMS mode, (2) Broker Database for independent mode, (3) Invoice generator on Finance page, (4) dynamic CRM sidebar label.

---

### 1. Database Migration

**A. Update `super_admin_organizations` view** to include `tms_mode`, `dot_number`, `mc_number`:
```sql
DROP VIEW IF EXISTS public.super_admin_organizations;
CREATE VIEW public.super_admin_organizations WITH (security_invoker = false) AS
SELECT id, name, subscription_tier, created_at, trial_ends_at, is_active,
       primary_color, logo_url, banner_url, is_complimentary, complimentary_ends_at,
       tms_mode, dot_number, mc_number,
       (SELECT count(*)::integer FROM profiles p WHERE p.org_id = o.id) AS user_count
FROM organizations o
WHERE is_super_admin();
```

**B. Update `super_admin_update_org` RPC** to accept `new_tms_mode text DEFAULT NULL` and apply it:
```sql
tms_mode = COALESCE(new_tms_mode, tms_mode),
```

**C. Add `invoice_status` column** to `fleet_loads`:
```sql
ALTER TABLE fleet_loads ADD COLUMN invoice_status text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN invoice_url text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN invoice_number text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN invoiced_at timestamptz DEFAULT NULL;
```

---

### 2. Super Admin — `OrgDetailSheet.tsx`

- Add "Business Configuration" section showing TMS Mode badge, DOT Number, MC Number (read from the org data already returned by the view).
- Add a "Change TMS Mode" dropdown (`landstar` / `independent`) with Save button, calling the updated `super_admin_update_org` RPC with `new_tms_mode`.
- Add state `selectedTmsMode` similar to existing `selectedTier`.

---

### 3. Broker Database — `src/components/crm/BrokerDatabase.tsx`

- New component for independent-mode CRM.
- Stores broker data in the existing `crm_contacts` table with `contact_type = 'broker'`.
- Fields displayed: Company Name (Broker Name), MC#, Credit Score (via `tags`), Average Days to Pay (via `notes` or a parsed field), Contact Info.
- Add broker-specific form fields: MC Number (stored in `agent_code` field), Credit Score, Avg Days to Pay.
- Uses existing `useCRMData` hooks filtered to `broker` type.

**CRM page update** (`src/pages/CRM.tsx`):
- Import `useOrganizationMode`.
- If `isIndependent`, render `<BrokerDatabase />` as the default view instead of showing agent tabs.
- If `isLandstar`, keep existing behavior.

---

### 4. Invoice Generator — `src/components/finance/InvoicingTab.tsx`

- New tab component showing delivered loads that haven't been invoiced (`invoice_status IS NULL`).
- Each row has a "Generate Invoice" button.
- Invoice generation:
  - Fetches org branding (name, logo, address from org data).
  - Maps load data: Rate, Fuel Surcharge, Accessorials, Detention, Lumper.
  - If `pod_signature_path` exists, fetches signed URL and includes it.
  - Generates PDF using an edge function (`generate-invoice`) that returns a PDF.
  - Stores PDF in `{org_id}/invoices/` storage bucket.
  - Updates load with `invoice_status = 'invoiced'`, `invoice_url`, `invoice_number`, `invoiced_at`.
- Shows invoiced loads in a separate "Sent" section.

**Finance page update** (`src/pages/Finance.tsx`):
- Import `useOrganizationMode`.
- Conditionally add "Invoicing" tab when `isIndependent`.

---

### 5. Sidebar CRM Label — `AppSidebar.tsx`

- Update the CRM nav item in `operationsItems`:
  - Dynamically set `title` and `icon` based on `currentTmsMode`:
    - Landstar: "Agent CRM", `Contact` icon
    - Independent: "Broker CRM", `Building2` icon

---

### 6. Edge Function — `supabase/functions/generate-invoice/index.ts`

- Accepts `load_id` in request body.
- Fetches load data + org branding from DB.
- Generates a professional invoice PDF (using a library like `jspdf` or server-rendered HTML-to-PDF).
- Uploads to storage bucket.
- Returns the file path.

---

### Files

| File | Action |
|------|--------|
| Migration SQL | Create — update view, RPC, add invoice columns |
| `src/components/superadmin/OrgDetailSheet.tsx` | Edit — add business config section + TMS mode override |
| `src/components/crm/BrokerDatabase.tsx` | Create — broker-focused CRM component |
| `src/pages/CRM.tsx` | Edit — conditionally show BrokerDatabase for independent mode |
| `src/components/finance/InvoicingTab.tsx` | Create — invoice generation tab |
| `src/pages/Finance.tsx` | Edit — add Invoicing tab for independent mode |
| `src/components/layout/AppSidebar.tsx` | Edit — dynamic CRM label/icon |
| `supabase/functions/generate-invoice/index.ts` | Create — PDF invoice generator edge function |

