

## Remove Mock Data from Factoring Portal

### Problem
The `FactoringBatchBuilder` component uses hardcoded mock loads and a hardcoded 2.5% fee rate. Meanwhile, the `FactoringTab` component directly below it already fetches real `fleet_loads` data, reads the factoring fee percentage from the organization settings, and provides the same batch-submit functionality — all without mock data.

### Solution
Remove the `FactoringBatchBuilder` component entirely and enhance the existing `FactoringTab` to incorporate the batch-builder's visual design elements (the split-layout with document indicators) while continuing to use real data.

### Changes

**1. Remove `FactoringBatchBuilder` from Finance page (`src/pages/Finance.tsx`)**
- Remove the import of `FactoringBatchBuilder`
- Remove `<FactoringBatchBuilder />` from the factoring tab content (line 1008)
- Keep `<FactoringTab />` as the sole component

**2. Enhance `FactoringTab` "Ready" tab (`src/components/finance/FactoringTab.tsx`)**
- In the "Ready to Submit" tab, add Rate Con and POD document indicators per load by checking the `documents` table for each load's attachments
- If a load is missing its POD, disable its checkbox and show a tooltip (matching the batch builder's UX)
- Display the factoring fee percentage from `orgSettings.factoring_fee_percentage` in the batch summary (already done)
- Show factoring provider name from `orgSettings.factoring_provider_name` in the header (already done)
- Add a small "Batch Summary" sidebar or section showing total gross, fee, and net payout for selected loads (bringing over the batch builder's summary panel)

**3. Delete `src/components/finance/FactoringBatchBuilder.tsx`**

### Technical details
- The `FactoringTab` already queries `organizations` for `factoring_fee_percentage` and `factoring_provider_name` — no new settings queries needed
- Document presence check: query `documents` table where `related_id IN (load_ids)` and `document_type IN ('rate_confirmation', 'pod')` to determine which loads have Rate Con / POD attached
- The fee rate label will dynamically show the configured percentage instead of hardcoded "2.5%"

