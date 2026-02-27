

## Smart Multi-File Settlement Import

### Overview
Replace the single-file upload in `StatementUpload.tsx` with a multi-file staging system that accepts all 4 document types simultaneously, cross-references and deduplicates data, then presents a reconciliation preview before importing.

### Changes

**1. New utility: `src/lib/settlement-reconciliation.ts`**
- Export interfaces: `StagedFile`, `ReconciledExpense`, `ReconciledEarning`, `ReconciliationResult`
- `detectFileType(file: File)` — pattern-match filename to one of 4 types: `settlement_xlsx`, `freight_bill_xlsx`, `card_activity_pdf`, `contractor_pdf`
- `reconcileDocuments(parsedResults: ParsedStatement[])` — main engine:
  - Collects all expenses from all parsed sources into a flat list with `source` tags
  - **Dedup logic**: groups by `(date, expense_type, amount)` — if two items match on all three, merge into one with `merged: true` and `sources: string[]`
  - Separates revenue/earnings rows (positive amounts from contractor PDF) into `earnings` array
  - Returns `{ earnings: ReconciledEarning[], expenses: ReconciledExpense[] }`

**2. Update `src/components/finance/StatementUpload.tsx`**
- **Multi-file dropzone**: Change `<input>` to `multiple`, update drag handlers to accept `File[]`
- **Staged files state**: `stagedFiles: { file: File, type: string, status: 'pending' | 'parsed' | 'error', data?: ParsedStatement }[]`
- **Document Checklist UI**: Show 4 rows (Settlement XLSX, Freight Bill XLSX, Card Activity PDF, Contractor PDF) with check/pending icons based on detected staged files
- **"Process Documents" button**: Iterates staged files — XLSX files go to `parseLandstarXlsx`, PDFs go to the edge function — then calls `reconcileDocuments()` on all results
- After processing, open the reconciliation preview (inline, replacing the current single-file table)

**3. New component: `src/components/finance/ReconciliationPreview.tsx`**
- Uses `Tabs` with two tabs: **"Earnings / Loads"** and **"Deductions / Expenses"**
- Each tab renders a `Table` with checkbox selection per row
- Merged items show a `<Badge>` with "Merged" or "Cross-Referenced" and tooltip listing source documents
- Duplicate items (matching existing DB records) show warning badge as before
- Inline date editing carried forward from current implementation
- Load matching UI carried forward from current implementation
- Footer with totals and **"Confirm & Import Data"** button
- Import logic reuses existing `handleImport` pattern (insert new, upsert duplicates)
- On success: toast, clear staging, call `onExpensesImported()`

**4. Flow**
```text
┌─────────────────────────────┐
│  Multi-File Dropzone        │
│  (drag multiple PDF/XLSX)   │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Document Checklist         │
│  ☑ Settlement XLSX          │
│  ☑ Freight Bill XLSX        │
│  ☐ Card Activity PDF        │
│  ☑ Contractor PDF           │
│  [Process Documents]        │
└──────────┬──────────────────┘
           │ parse each file
┌──────────▼──────────────────┐
│  Reconciliation Engine      │
│  - merge duplicates         │
│  - cross-reference by       │
│    Freight Bill #, amount,  │
│    date                     │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Reconciliation Preview     │
│  Tab 1: Earnings/Loads      │
│  Tab 2: Deductions/Expenses │
│  [Confirm & Import Data]    │
└─────────────────────────────┘
```

### Files Created
- `src/lib/settlement-reconciliation.ts`
- `src/components/finance/ReconciliationPreview.tsx`

### Files Modified
- `src/components/finance/StatementUpload.tsx` — replace single-file flow with multi-file staging + checklist + process button; delegate preview to `ReconciliationPreview`

### Technical Notes
- No new dependencies needed (`xlsx` already installed, no need for react-dropzone — native drag/drop is already implemented)
- No database schema changes required
- No edge function changes — PDFs still go to `parse-landstar-statement` one at a time; XLSX parsed client-side
- Earnings tab is display-only for now (no load creation) — just shows revenue lines from contractor PDFs for cross-reference visibility

