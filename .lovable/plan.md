

## Global Command Palette + DataTable CSV Export

### 1. Command Palette (`src/components/shared/CommandPalette.tsx`) — New file

Uses the existing `cmdk`-based shadcn Command component (`src/components/ui/command.tsx`).

**Behavior:**
- Opens on `Cmd+K` / `Ctrl+K` via a global keydown listener
- Groups results into **Navigation** and **Quick Actions**
- Navigation items derived from the same route/label map used in the sidebar (Drivers, Dispatch, Finance, IFTA, Settings, etc.) — filtered by the user's roles/tier so they only see pages they can access
- Quick Actions: "New Load" → navigates to `/fleet-loads` (or opens create dialog), "Upload Expense Report" → `/finance`, "New Maintenance Request" → `/maintenance`
- Each item shows an icon + label; selecting navigates via `useNavigate` and closes the palette
- Search filters across all items by label

**Integration:**
- Rendered once inside `DashboardLayout` (alongside breadcrumbs, sidebar, etc.) so it's available on every authenticated page
- No changes to `App.tsx` routing needed

### 2. DataTable CSV Export (`src/components/shared/DataTable.tsx`)

**Changes:**
- Add an optional `exportFilename?: string` prop to `DataTableProps`
- When provided, render a "Export CSV" button (Download icon) above/beside the table
- Export logic: iterate `columns` and `data`, use each column's `header` as CSV header, use `col.render` text content or raw `item[col.key]` as cell value
- Generate a Blob with `text/csv` MIME type, trigger download via a temporary `<a>` element
- No new dependencies needed — pure JS CSV generation

### Files
| File | Action |
|---|---|
| `src/components/shared/CommandPalette.tsx` | Create |
| `src/components/shared/DataTable.tsx` | Edit (add export button + prop) |
| `src/components/layout/DashboardLayout.tsx` | Edit (render CommandPalette, add Cmd+K listener) |

