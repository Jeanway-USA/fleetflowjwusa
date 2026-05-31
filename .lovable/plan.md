## Goal
Add two new template variables — `{{pay_type}}` and `{{pay_rate}}` — to the Variable Reference Guide sidebar in the Document Templates panel, with explanatory helper text.

## Changes

### 1. `src/components/settings/DocumentTemplatesPanel.tsx`
- Append two entries to the `VARIABLES` constant array (around line 54–144):
  - `{{pay_type}}` — "Auto-fills with the compensation type set by the Administrator on the Drivers page (e.g., CPM, Flat Rate, Percentage, Hourly). This is strictly read-only for the driver."
  - `{{pay_rate}}` — "Auto-fills with the compensation rate set by the Administrator on the Drivers page. This is strictly read-only for the driver."

No other files need changes. The `VARIABLES` array is rendered automatically in the sidebar Tabs component.