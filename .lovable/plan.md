## Fix the "edited agent disappears" bug and restore the LTL agent

### Why it happened

`src/components/crm/ContactFormDialog.tsx` assumes every agent contact lives in `company_resources`. When you edited the auto-added LTL agent (which lives in `crm_contacts`), the save path took the `crm` branch but hard-coded `contact_type` to `'broker'` or `'vendor'` and dropped `agent_code` / `agent_status`. The row was rewritten as a vendor, so the Freight Agencies tab (which filters to `agent`/`broker`) stopped showing it.

### Fix (single file: `src/components/crm/ContactFormDialog.tsx`)

In the `target === 'crm'` save branch, write the actual form type and preserve agent fields when applicable:

- `contact_type`: derive from `formType` — `'broker'` when broker, `'agent'` when agent, otherwise `'vendor'`.
- When `isAgent`, persist `agent_code` (uppercased, trimmed) and `agent_status` instead of nulling them, and use the agent code (or company name) as `company_name` so the row stays identifiable.
- Tags continue to apply only to broker / vendor-other.

This keeps existing broker/vendor saves identical and only changes the agent-in-crm path that caused the bug. No schema or trigger changes needed.

### Restore the LTL agent

One data update on `crm_contacts` for id `79bb3ba1-78e7-4920-9a63-389118802d6d`:

- `contact_type` → `'agent'`
- `agent_code` → `'LTL'`
- `agent_status` → `'safe'`
- Leave the edited `notes` ("Amazing Agency! Lots of good loads originating in the Dallas, TX area.") and `company_name='LTL'` as-is — these are the user's edits and should survive.

After this, the row reappears under **Freight Agencies** with the LTL agent code and the user's note intact.

### Out of scope

- No changes to other branches (resource / facility) of the dialog.
- No changes to the auto-harvest triggers or backfill.