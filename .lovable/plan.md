## Summary
Add six new Direct Deposit variables to the `VARIABLES` array in `DocumentTemplatesPanel.tsx` so administrators see them in the editor sidebar.

## Files Changed
- `src/components/settings/DocumentTemplatesPanel.tsx`

## Details
Append the following entries to the existing `VARIABLES` constant (after `{{file_upload}}`):

| Token | Description |
|---|---|
| `{{ssn}}` | Renders a secure input for the driver's Social Security Number. |
| `{{email}}` | Auto-fills the driver's email from their user profile. |
| `{{bank_account_type}}` | Renders a dropdown for Checking or Savings. |
| `{{bank_name}}` | Renders a text input for the Bank Name. |
| `{{routing_number}}` | Renders a text input for the Routing Number. |
| `{{account_number}}` | Renders a text input for the Account Number. |

The `src/pages/admin/DocumentTemplates.tsx` page consumes `DocumentTemplatesPanel`, so no changes are needed there.

## Out of Scope
- No changes to `DocumentTemplateRenderer.tsx` (parser / rendering logic) — the scope is strictly the reference guide sidebar.
- No database or RLS changes.