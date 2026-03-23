

## Plan: Fix Status History & Add POD Viewer to Load Details

### Two Issues

**1. Status history shows empty for all loads**
The database trigger `log_load_status_change()` inserts into `load_status_logs` without setting `org_id`. The RLS policies require `org_id = get_user_org_id(auth.uid())`, so all rows with NULL `org_id` are invisible. The manual insert in `ProofOfDeliveryDialog` also omits `org_id`.

**2. No way to view POD from the load details dialog**
POD documents (signature + Transflo link) are saved to the `documents` table with `related_type = 'load'` and `related_id = loadId`, but the Fleet Loads dialog has no tab or section to view them.

### Solution

#### Database Migration
- Update the trigger function `log_load_status_change()` to copy `org_id` from the `fleet_loads` row:
  ```sql
  INSERT INTO load_status_logs (load_id, previous_status, new_status, changed_by, org_id)
  VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.org_id);
  ```
- Backfill existing NULL `org_id` rows by joining against `fleet_loads`:
  ```sql
  UPDATE load_status_logs SET org_id = fl.org_id
  FROM fleet_loads fl WHERE fl.id = load_status_logs.load_id
  AND load_status_logs.org_id IS NULL;
  ```

#### Fix manual insert in ProofOfDeliveryDialog
- In `src/components/driver/ProofOfDeliveryDialog.tsx` line ~126, add `org_id` to the manual `load_status_logs` insert (fetch from load or pass as prop).

#### Add POD tab to load details dialog
- In `src/pages/FleetLoads.tsx`:
  - Change the tabs grid from `grid-cols-5` to `grid-cols-6`
  - Add a new "POD" tab trigger with a `FileCheck` icon
  - Add a `TabsContent` for "pod" that queries `documents` where `related_type = 'load'` and `related_id = loadId`, filtering for `document_type IN ('pod_signature', 'transflo_pod')`
  - Display: signature image (via signed URL), Transflo link (as clickable external link), and upload date
  - Show "No POD captured" empty state when none exist

### Files

| File | Change |
|------|--------|
| Migration SQL | Fix trigger to include `org_id`, backfill existing rows |
| `src/components/driver/ProofOfDeliveryDialog.tsx` | Add `org_id` to manual status log insert |
| `src/pages/FleetLoads.tsx` | Add POD tab to load details dialog |

