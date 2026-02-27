

## Add XLSX Parsing to Landstar Statement Import

### Problem
The import currently only accepts PDFs. The user wants to also accept `.xlsx` files exported from Landstar (Settlement Details and Freight Bill Details), which contain structured tabular data that can be parsed client-side without AI.

### Data Rules (from user)
- **Negative Transaction Amt** = expense → import these
- **Positive Transaction Amt** = revenue → **skip/ignore**
- **Exception**: Items containing "REIMB" = reimbursement → keep, mark as `is_reimbursement: true`

### Changes

**1. Install `xlsx` package** (SheetJS) for client-side Excel parsing.

**2. New file: `src/lib/parse-landstar-xlsx.ts`**
- Client-side parser that reads XLSX files and returns the same `ExtractedExpense[]` / `ParsedStatement` shape used by the PDF parser
- Detects which format (Settlement Details vs Freight Bill Details) based on column headers
- Maps descriptions to `expense_type` using the same mapping as the edge function:
  - `CARD FEE` → "Card Fee"
  - `CARD PRE-TRIP` → "Card Load"  
  - `TRIP% ESCROW` → "Escrow Payment"
  - `TRKSTP SCN` → "Trip Scanning"
  - `DD FEE` → "Direct Deposit Fee"
  - `PERMITS` → "Licensing/Permits"
  - `PLATE` → "Registration/Plates"
  - `BP OTA/NTTA/E470` → "Tolls"
  - `PREPASS` → "PrePass/Scale"
  - `LCN FEES` → "LCN/Satellite"
  - `NTP TRUCK WARRANTY` → "Truck Warranty"
  - `UNLADEN LIABILITY` → "Insurance"
  - `CPP` → "CPP/Benefits"
  - `CARD CONT. SPEC ADV` → "Cash Advance"
  - `REIMB` → "Reimbursement" with `is_reimbursement: true` and positive amount
- Filters out revenue rows (positive amount, no "REIMB" keyword)
- Extracts Freight Bill # as `trip_number`, settlement date as `date`, tractor # as `unit_number`

**3. Update `src/components/finance/StatementUpload.tsx`**
- Accept `.xlsx` and `.xls` in addition to `.pdf`
- Update file type validation in `processFile`, `handleDrop`, and the `<input accept>` attribute
- For XLSX files: parse client-side using the new parser (no edge function call needed)
- For PDF files: continue using the existing edge function flow
- Update drop zone text: "Drop Statement PDF or Excel file here" / "Supports Card Activity, Contractor Statements & Excel exports"

