## Live Agency CRM validation in the Load form

Add an instant CRM safety lookup to the Agency Code field in the Fleet Load create/edit dialog (`src/pages/FleetLoads.tsx`), the only form that captures agency codes.

### 1. New hook: `src/hooks/useAgencyCRMStatus.ts`

- Accepts an `agencyCode` string.
- Trims + uppercases the input and **only queries when length ≥ 2** (avoids noisy lookups while typing a single character or an empty box).
- Debounces input by ~250 ms via local `setTimeout` state.
- Runs a TanStack `useQuery` against `crm_contacts` filtered by `org_id`, `contact_type in ('agent','broker')`, and `agent_code ilike <code>` (case-insensitive exact match), `limit 1`.
- Returns one of four states: `idle` (empty/too short), `loading`, `found` (with `{ company_name, agent_status, notes }`), or `not_found`.
- Gracefully returns `idle` for empty / whitespace input so no errors surface mid-typing.

### 2. New component: `src/components/loads/AgencyCRMStatusBadge.tsx`

Renders below the Agency Code input based on hook state:

- `idle` → nothing.
- `loading` → muted "Checking CRM…" badge with spinner.
- `found` + `agent_status === 'safe'` → green badge: **✓ CRM Approved: Safe** (shows company name).
- `found` + `agent_status` in `'unsafe' | 'not_safe' | 'blocked'` → red destructive alert: **⚠ WARNING: DO NOT USE — Agency Blocked**, displays company name + `notes` as the reason. Also exposes an `onBlockedChange` callback so the parent form can disable submit.
- `found` with any other status → neutral info badge showing the status verbatim.
- `not_found` → blue info badge: **✦ New Agency: Will Auto-Harvest as Safe** (explains the trigger will register it on save).

### 3. Wire into `FleetLoads.tsx`

- Import the hook and badge.
- Track `const [agencyBlocked, setAgencyBlocked] = useState(false)`.
- Below the existing Agency Code input (line ~1139), render `<AgencyCRMStatusBadge agencyCode={formData.agency_code} onBlockedChange={setAgencyBlocked} />`.
- Reset `agencyBlocked` to false whenever the dialog opens/closes or the code is cleared (handled inside the badge's effect).
- Disable the submit Button (line 1787) when `agencyBlocked` is true, and short-circuit `handleSubmit` (line 442) with a toast if somehow invoked while blocked.

### Notes / out of scope

- Auto-harvest already happens via the existing `AFTER INSERT` trigger on `fleet_loads` — no DB changes needed; the "New Agency" badge is purely informational.
- `SmartLoadCreator` only displays extracted PDF data and has no editable agency-code input, so no changes there.
- Independent / agency load forms don't use `agency_code`, so they're untouched.
- No schema or RLS changes; `crm_contacts` is already readable to org members.