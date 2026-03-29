

## Plan: Independent Mode Features — Broker CRM, Invoicing, Super Admin Override

### Overview
This plan adds four capabilities: (1) Super Admin can view/override org TMS mode, (2) Broker Database for independent mode, (3) Invoice generator on Finance page, (4) dynamic CRM sidebar label.

---

### 1. Database Migration ✅

- Updated `super_admin_organizations` view to include `tms_mode`, `dot_number`, `mc_number`
- Updated `super_admin_update_org` RPC to accept `new_tms_mode` parameter
- Added `invoice_status`, `invoice_url`, `invoice_number`, `invoiced_at` columns to `fleet_loads`

### 2. Super Admin — `OrgDetailSheet.tsx` ✅

- Added "Business Configuration" section showing TMS Mode badge, DOT/MC numbers
- Added "Change TMS Mode" dropdown with Save button

### 3. Broker Database — `BrokerDatabase.tsx` ✅

- Created broker CRM component using `crm_contacts` with `contact_type = 'broker'`
- Fields: Broker Name, MC#, Credit Score, Avg Days to Pay, Contact Info
- CRM page routes to BrokerDatabase when `isIndependent`

### 4. Invoice Generator — `InvoicingTab.tsx` ✅

- Created invoicing tab showing delivered loads ready to invoice
- Generates invoice numbers and marks loads as invoiced
- Shows invoiced loads in a separate "Sent" section
- Tab visible only in independent mode

### 5. Sidebar CRM Label — `AppSidebar.tsx` ✅

- CRM nav item dynamically shows "Agent CRM" (Contact icon) or "Broker CRM" (Building2 icon) based on mode

### Files Changed

| File | Action |
|------|--------|
| Migration SQL | Created — updated view, RPC, added invoice columns |
| `src/components/superadmin/OrgDetailSheet.tsx` | Edited — business config + TMS mode override |
| `src/components/crm/BrokerDatabase.tsx` | Created — broker CRM component |
| `src/pages/CRM.tsx` | Edited — routes to BrokerDatabase for independent mode |
| `src/components/finance/InvoicingTab.tsx` | Created — invoice generation tab |
| `src/pages/Finance.tsx` | Edited — added Invoicing tab for independent mode |
| `src/components/layout/AppSidebar.tsx` | Edited — dynamic CRM label/icon |
