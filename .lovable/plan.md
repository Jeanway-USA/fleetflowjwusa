

## Two Changes

### 1. Add Mass Delete Button to Manage Expenses (Finance.tsx)

**Location**: Next to the existing "Edit X Selected" button (line 604-608)

- Add a "Delete X Selected" button with destructive styling when `selectedExpenseIds.size > 0`
- Add a `massDeleteExpensesMutation` that deletes all selected expense IDs via `supabase.from('expenses').delete().in('id', [...selectedExpenseIds])`
- Show a `ConfirmDeleteDialog` before executing the mass delete
- Add state `massDeleteDialogOpen` to control the confirmation dialog
- Clear `selectedExpenseIds` after successful deletion

### 2. Editable Date Column in Statement Import Preview (StatementUpload.tsx)

**Location**: The Date column in the extracted expenses table (line 584-592)

- Make the date cell clickable/editable with a date `<Input type="date">` inline edit
- When clicking the date, show an inline date input; on change, update the expense's `date` field in the `expenses` state
- Use the same inline editing pattern as the Load Match column (click to edit, show input, click away to close)

