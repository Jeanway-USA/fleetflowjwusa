import { format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp, ChevronsUpDown, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { isAdvanceExpense, isCreditExpense } from '@/lib/expense-types';
import type { Database } from '@/integrations/supabase/types';

type Expense = Database['public']['Tables']['expenses']['Row'];

export type ExpenseSortField = 'expense_date' | 'expense_type' | 'description' | 'amount' | 'gallons' | 'truck_id' | 'load_id';

interface ExpensesListProps {
  /** The rows on the current page. */
  rows: Expense[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  sortField: ExpenseSortField;
  sortDirection: 'asc' | 'desc';
  onSort: (field: ExpenseSortField) => void;
  typeOptions: Array<{ type: string; count: number }>;
  onSelectByType: (type: string) => void;
  truckName: (id: string | null) => string;
  loadName: (id: string | null) => string;
  onAdd: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
}

const COLUMNS: Array<{ field: ExpenseSortField; label: string; align?: 'right' }> = [
  { field: 'expense_date', label: 'Date' },
  { field: 'expense_type', label: 'Type' },
  { field: 'description', label: 'Description' },
  { field: 'amount', label: 'Amount', align: 'right' },
  { field: 'gallons', label: 'Gallons', align: 'right' },
  { field: 'truck_id', label: 'Truck' },
  { field: 'load_id', label: 'Trip' },
];

function dateLabel(date: string | null) {
  return date ? format(parseISO(date), 'MMM d, yyyy') : 'No date';
}

function RowMenu({ expense, onEdit, onDelete }: { expense: Expense; onEdit: (e: Expense) => void; onDelete: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for ${expense.expense_type} ${expense.description ?? ''}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(expense)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => onDelete(expense.id)}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Costs read plain, credits are green with a plus, card advances are muted: only credits and problems get color. */
function Amount({ expense }: { expense: Expense }) {
  const credit = isCreditExpense(expense);
  const advance = isAdvanceExpense(expense);
  const abs = Math.abs(Number(expense.amount));
  return (
    <span className={cn('figure font-semibold', credit && 'text-success', advance && 'text-muted-foreground')}>
      {credit ? '+' : ''}{formatCurrency(abs)}
    </span>
  );
}

export function ExpensesList(props: ExpensesListProps) {
  const {
    rows, totalCount, page, pageSize, onPage, selectedIds, allSelected, onToggle, onToggleAll, sortField, sortDirection,
    onSort, typeOptions, onSelectByType, truckName, loadName, onAdd, onEdit, onDelete, onBulkEdit, onBulkDelete,
  } = props;
  const selectedCount = selectedIds.size;
  const from = totalCount === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);

  const SortMark = ({ field }: { field: ExpenseSortField }) =>
    sortField !== field ? <ChevronsUpDown className="ml-1 h-3 w-3 opacity-40" /> : sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;

  return (
    <section aria-labelledby="expenses-title" className="rounded-lg border bg-card">
      <header className="flex flex-col gap-3 px-4 pt-3 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 id="expenses-title" className="font-condensed text-xl font-bold leading-tight">Expenses</h3>
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {totalCount === 0 ? 'None in this period' : `${totalCount.toLocaleString()} ${totalCount === 1 ? 'row' : 'rows'}, link each to a trip or truck when you can`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={onSelectByType}>
            <SelectTrigger className="h-11 w-full sm:w-44" aria-label="Select all of one type"><SelectValue placeholder="Select by type" /></SelectTrigger>
            <SelectContent>
              {typeOptions.map(({ type, count }) => (
                <SelectItem key={type} value={type}>{type} ({count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="h-11 gap-2" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        </div>
      </header>

      {selectedCount > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-t bg-primary/5 px-4 py-2">
          <span className="mr-auto text-[15px] font-medium tabular-nums">{selectedCount} selected</span>
          <Button variant="outline" className="h-11" onClick={onBulkEdit}>Edit {selectedCount} Selected</Button>
          <Button variant="destructive" className="h-11 gap-2" onClick={onBulkDelete}>
            <Trash2 className="h-4 w-4" /> Delete {selectedCount} Selected
          </Button>
        </div>
      )}

      {totalCount === 0 ? (
        <p className="border-t px-4 py-8 text-center text-sm text-muted-foreground">No expenses for this period.</p>
      ) : (
        <>
          {/* Phone: one card per expense */}
          <div className="border-t md:hidden">
            <div className="flex items-center gap-3 border-b px-4 py-1">
              <label className="flex min-h-11 flex-1 items-center gap-3 text-[15px]">
                <Checkbox className="h-5 w-5" checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all expenses in this period" />
                Select all
              </label>
              <Select value={sortField} onValueChange={(v) => onSort(v as ExpenseSortField)}>
                <SelectTrigger className="h-11 w-36" aria-label="Sort by"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((c) => <SelectItem key={c.field} value={c.field}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label={sortDirection === 'asc' ? 'Oldest first, tap for newest first' : 'Newest first, tap for oldest first'} onClick={() => onSort(sortField)}>
                {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
            <ul className="divide-y">
              {rows.map((e) => {
                const advance = isAdvanceExpense(e);
                const trip = loadName(e.load_id);
                return (
                  <li key={e.id} className={cn('flex items-start gap-1 py-1 pl-4 pr-1', selectedIds.has(e.id) && 'bg-primary/5')}>
                    <div className="flex h-11 items-center">
                      <Checkbox className="h-5 w-5" checked={selectedIds.has(e.id)} onCheckedChange={() => onToggle(e.id)} aria-label={`Select ${e.expense_type} ${e.description ?? ''}`} />
                    </div>
                    <div className="min-w-0 flex-1 px-2 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{e.description || e.expense_type}</span>
                        <Amount expense={e} />
                      </div>
                      <div className="text-[13px] text-muted-foreground">
                        {dateLabel(e.expense_date)}, {e.expense_type}
                        {advance && ', card advance'}
                        {e.gallons ? `, ${e.gallons} gal` : ''}
                        {trip !== '-' ? `, trip ${trip}` : ''}
                      </div>
                    </div>
                    <RowMenu expense={e} onEdit={onEdit} onDelete={onDelete} />
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Desktop: the table */}
          <div className="hidden overflow-x-auto border-t md:block">
            <table className="w-full text-[15px]">
              <caption className="sr-only">Expenses for the selected period</caption>
              <thead>
                <tr className="border-b text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="w-12 py-2 pl-4">
                    <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all expenses in this period" />
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.field}
                      scope="col"
                      aria-sort={sortField === c.field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={cn('py-2', c.align === 'right' && 'text-right', c.field === 'gallons' && 'pr-8')}
                    >
                      <button type="button" className={cn('inline-flex min-h-9 items-center uppercase tracking-wider hover:text-foreground', c.align === 'right' && 'flex-row-reverse')} onClick={() => onSort(c.field)}>
                        {c.label}
                        <SortMark field={c.field} />
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="w-12 py-2 pr-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((e) => {
                  const advance = isAdvanceExpense(e);
                  return (
                    <tr key={e.id} className={cn(selectedIds.has(e.id) && 'bg-primary/5', advance && 'text-muted-foreground')}>
                      <td className="py-2 pl-4"><Checkbox checked={selectedIds.has(e.id)} onCheckedChange={() => onToggle(e.id)} aria-label={`Select ${e.expense_type} ${e.description ?? ''}`} /></td>
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{e.expense_date ? format(parseISO(e.expense_date), 'MM/dd/yyyy') : 'No date'}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {e.expense_type}
                        {advance && <span className="ml-2 text-[13px] text-muted-foreground">Card advance</span>}
                      </td>
                      <td className="max-w-[18rem] truncate py-2 pr-3" title={e.description ?? undefined}>{e.description || ''}</td>
                      <td className="py-2 pr-3 text-right"><Amount expense={e} /></td>
                      <td className="py-2 pr-8 text-right tabular-nums">{e.gallons ? `${e.gallons} gal` : ''}</td>
                      <td className="py-2 pr-3">{truckName(e.truck_id) !== '-' ? truckName(e.truck_id) : ''}</td>
                      <td className="py-2 pr-3 tabular-nums">{loadName(e.load_id) !== '-' ? loadName(e.load_id) : ''}</td>
                      <td className="py-1 pr-2"><RowMenu expense={e} onEdit={onEdit} onDelete={onDelete} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalCount > pageSize && (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-2">
              <p className="text-[13px] text-muted-foreground tabular-nums">Showing {from}–{to} of {totalCount}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
                <Button variant="outline" className="h-11" disabled={(page + 1) * pageSize >= totalCount} onClick={() => onPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
