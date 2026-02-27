import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link, Unlink, Edit2, X, AlertTriangle, TrendingUp, TrendingDown, Layers, CheckCircle, Banknote, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { extractJurisdictionFromVendor } from '@/lib/us-states';
import type { ReconciliationResult, ReconciledExpense } from '@/lib/settlement-reconciliation';

interface FleetLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
}

interface Truck {
  id: string;
  unit_number: string;
}

interface ExistingExpense {
  id: string;
  expense_date: string;
  expense_type: string;
  amount: number;
  load_id: string | null;
}

interface ReconciliationPreviewProps {
  result: ReconciliationResult;
  existingLoads: FleetLoad[];
  trucks: Truck[];
  existingExpenses: ExistingExpense[];
  orgId: string | null;
  onImported: () => void;
  onCancel: () => void;
}

interface ExpenseRow extends ReconciledExpense {
  matchedLoad: FleetLoad | null;
  matchedTruck: Truck | null;
  isDuplicate: boolean;
  duplicateId: string | null;
  jurisdiction: string | null;
}

function buildRows(
  items: ReconciledExpense[],
  existingLoads: FleetLoad[],
  trucks: Truck[],
  existingExpenses: ExistingExpense[],
  unitNumber: string | null
): ExpenseRow[] {
  return items.map(exp => {
    const matchedLoad = findMatchingLoad(exp.trip_number, existingLoads);
    const duplicateId = findDuplicateId(exp, existingExpenses);
    const isFuelType = ['Fuel', 'DEF'].includes(exp.expense_type);
    const jurisdiction = isFuelType ? extractJurisdictionFromVendor(exp.vendor || exp.description) : null;
    return {
      ...exp,
      selected: !duplicateId,
      matchedLoad,
      matchedTruck: findMatchingTruck(unitNumber, trucks),
      isDuplicate: duplicateId !== null,
      duplicateId,
      jurisdiction,
    };
  });
}

function findMatchingLoad(tripNumber: string | null, existingLoads: FleetLoad[]): FleetLoad | null {
  if (!tripNumber) return null;
  const numericId = tripNumber.replace(/^[A-Z]{3}\s*/i, '').trim();
  return existingLoads.find(load => {
    if (!load.landstar_load_id) return false;
    const loadNumericId = load.landstar_load_id.replace(/^[A-Z]{3}\s*/i, '').trim();
    return loadNumericId === numericId || load.landstar_load_id === numericId;
  }) || null;
}

function findMatchingTruck(unitNumber: string | null, trucks: Truck[]): Truck | null {
  if (!unitNumber) return null;
  const cleanUnit = unitNumber.replace(/\D/g, '');
  return trucks.find(t => t.unit_number.includes(cleanUnit) || cleanUnit.includes(t.unit_number)) || null;
}

function findDuplicateId(expense: ReconciledExpense, existingExpenses: ExistingExpense[]): string | null {
  const dup = existingExpenses.find(existing => {
    const sameDate = existing.expense_date === expense.date;
    const sameType = existing.expense_type === expense.expense_type;
    const sameAmount = Math.abs(existing.amount - Math.abs(expense.amount)) < 0.01;
    return sameDate && sameType && sameAmount;
  });
  return dup?.id || null;
}

export function ReconciliationPreview({
  result,
  existingLoads,
  trucks,
  existingExpenses,
  orgId,
  onImported,
  onCancel,
}: ReconciliationPreviewProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [editingIndex, setEditingIndex] = useState<{ tab: string; index: number } | null>(null);

  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(() =>
    buildRows(result.expenses, existingLoads, trucks, existingExpenses, result.unitNumber)
  );
  const [advanceRows, setAdvanceRows] = useState<ExpenseRow[]>(() =>
    buildRows(result.advances, existingLoads, trucks, existingExpenses, result.unitNumber)
  );
  const [creditRows, setCreditRows] = useState<ExpenseRow[]>(() =>
    buildRows(result.credits, existingLoads, trucks, existingExpenses, result.unitNumber)
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  // Totals
  const selectedExpenses = expenseRows.filter(e => e.selected);
  const selectedAdvances = advanceRows.filter(e => e.selected);
  const selectedCredits = creditRows.filter(e => e.selected);

  const expensesTotal = selectedExpenses.reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const creditsTotal = selectedCredits.reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const advancesTotal = selectedAdvances.reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const netExpense = expensesTotal - creditsTotal;

  const mergedCount = [...expenseRows, ...advanceRows, ...creditRows].filter(e => e.merged).length;
  const duplicateCount = [...expenseRows, ...advanceRows, ...creditRows].filter(e => e.isDuplicate).length;

  const toggleRow = (
    setter: React.Dispatch<React.SetStateAction<ExpenseRow[]>>,
    index: number
  ) => {
    setter(prev => prev.map((r, i) => i === index ? { ...r, selected: !r.selected } : r));
  };

  const toggleAll = (
    setter: React.Dispatch<React.SetStateAction<ExpenseRow[]>>,
    selected: boolean
  ) => {
    setter(prev => prev.map(r => ({ ...r, selected })));
  };

  const updateLoadMatch = (
    setter: React.Dispatch<React.SetStateAction<ExpenseRow[]>>,
    index: number,
    loadId: string | null
  ) => {
    const matchedLoad = loadId ? existingLoads.find(l => l.id === loadId) || null : null;
    setter(prev => prev.map((r, i) => i === index ? { ...r, matchedLoad } : r));
    setEditingIndex(null);
  };

  const updateDate = (
    setter: React.Dispatch<React.SetStateAction<ExpenseRow[]>>,
    index: number,
    newDate: string
  ) => {
    setter(prev => prev.map((r, i) => i === index ? { ...r, date: newDate } : r));
  };

  const handleImport = async () => {
    const allSelected = [
      ...selectedExpenses.map(e => ({ ...e, importType: 'expense' as const })),
      ...selectedAdvances.map(e => ({ ...e, importType: 'advance' as const })),
      ...selectedCredits.map(e => ({ ...e, importType: 'credit' as const })),
    ];

    if (allSelected.length === 0) {
      toast.error('No items selected for import');
      return;
    }

    const validItems = allSelected.filter(exp => exp.date && /^\d{4}-\d{2}-\d{2}$/.test(exp.date));
    if (validItems.length === 0) {
      toast.error('No items with valid dates to import');
      return;
    }

    setIsImporting(true);
    try {
      const newItems = validItems.filter(exp => !exp.duplicateId);
      const dupeItems = validItems.filter(exp => exp.duplicateId);
      let insertedCount = 0;
      let updatedCount = 0;

      if (newItems.length > 0) {
        const inserts = newItems.map(exp => ({
          expense_date: exp.date,
          expense_type: exp.importType === 'advance' ? 'Advance'
            : exp.is_reimbursement ? 'Reimbursement'
            : exp.expense_type,
          amount: exp.importType === 'credit' ? -Math.abs(exp.amount) : Math.abs(exp.amount),
          description: exp.description,
          vendor: exp.vendor,
          gallons: exp.gallons,
          load_id: exp.matchedLoad?.id || null,
          truck_id: exp.matchedTruck?.id || null,
          notes: exp.importType === 'advance' ? 'Advance (Non-P&L)'
            : exp.is_reimbursement ? 'Reimbursement/Refund'
            : exp.is_discount ? 'Discount/Credit'
            : null,
          jurisdiction: exp.jurisdiction,
          org_id: orgId,
        }));
        const { error } = await supabase.from('expenses').insert(inserts);
        if (error) throw error;
        insertedCount = newItems.length;
      }

      for (const exp of dupeItems) {
        const { error } = await supabase
          .from('expenses')
          .update({
            expense_date: exp.date,
            expense_type: exp.importType === 'advance' ? 'Advance'
              : exp.is_reimbursement ? 'Reimbursement'
              : exp.expense_type,
            amount: exp.importType === 'credit' ? -Math.abs(exp.amount) : Math.abs(exp.amount),
            description: exp.description,
            vendor: exp.vendor,
            gallons: exp.gallons,
            load_id: exp.matchedLoad?.id || null,
            truck_id: exp.matchedTruck?.id || null,
            notes: exp.importType === 'advance' ? 'Advance (Non-P&L)'
              : exp.is_reimbursement ? 'Reimbursement/Refund'
              : exp.is_discount ? 'Discount/Credit'
              : null,
            jurisdiction: exp.jurisdiction,
            org_id: orgId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', exp.duplicateId!);
        if (error) throw error;
        updatedCount++;
      }

      const msgs: string[] = [];
      if (insertedCount > 0) msgs.push(`${insertedCount} new`);
      if (updatedCount > 0) msgs.push(`${updatedCount} updated`);
      toast.success(`Successfully imported: ${msgs.join(', ')} items`);
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setIsImporting(false);
    }
  };

  const renderTable = (
    rows: ExpenseRow[],
    setter: React.Dispatch<React.SetStateAction<ExpenseRow[]>>,
    tabKey: string,
    colorClass: string
  ) => (
    <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={rows.filter(r => r.selected).length === rows.length && rows.length > 0}
                onCheckedChange={(checked) => toggleAll(setter, !!checked)}
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Load Match</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                No items in this category
              </TableCell>
            </TableRow>
          ) : rows.map((row, index) => (
            <TableRow
              key={index}
              className={cn(
                row.isDuplicate && 'bg-warning/10',
                !row.selected && 'opacity-50'
              )}
            >
              <TableCell>
                <Checkbox checked={row.selected} onCheckedChange={() => toggleRow(setter, index)} />
              </TableCell>
              <TableCell className="text-sm">
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateDate(setter, index, e.target.value)}
                    className="bg-transparent border-b border-dashed border-muted-foreground/40 hover:border-primary focus:border-primary focus:outline-none text-sm w-32 cursor-pointer"
                  />
                  {row.isDuplicate && (
                    <span title="Potential duplicate">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {row.expense_type}
                </Badge>
              </TableCell>
              <TableCell className="text-sm max-w-40 truncate" title={row.description}>
                {row.vendor || row.description}
                {row.gallons && (
                  <span className="text-xs text-muted-foreground ml-1">({row.gallons.toFixed(1)} gal)</span>
                )}
              </TableCell>
              <TableCell className={cn('text-right font-mono text-sm font-medium', colorClass)}>
                {colorClass.includes('success') ? '+' : '-'}{formatCurrency(Math.abs(row.amount))}
              </TableCell>
              <TableCell>
                {row.merged ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-xs bg-blue-500/20 text-blue-600 border-blue-300 dark:text-blue-400 cursor-help">
                        Merged
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Cross-referenced from:</p>
                      <ul className="text-xs list-disc pl-3">
                        {row.sources.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-muted-foreground">{row.sources[0]}</span>
                )}
              </TableCell>
              <TableCell className="min-w-[180px]">
                {editingIndex?.tab === tabKey && editingIndex?.index === index ? (
                  <div className="flex items-center gap-1">
                    <Select
                      value={row.matchedLoad?.id || 'none'}
                      onValueChange={(v) => updateLoadMatch(setter, index, v === 'none' ? null : v)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[140px]">
                        <SelectValue placeholder="Select load" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="flex items-center gap-1"><Unlink className="h-3 w-3" /> No link</span>
                        </SelectItem>
                        {existingLoads.map(load => (
                          <SelectItem key={load.id} value={load.id}>
                            <span className="font-mono text-xs">{load.landstar_load_id}</span>
                            <span className="text-muted-foreground ml-1 text-xs truncate">
                              {load.origin?.split(',')[0]} → {load.destination?.split(',')[0]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingIndex(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {row.matchedLoad ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Link className="h-3 w-3 text-success" />
                        <span className="text-success font-mono">{row.matchedLoad.landstar_load_id}</span>
                      </div>
                    ) : row.trip_number ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Unlink className="h-3 w-3" />
                        <span className="font-mono">{row.trip_number}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-1 opacity-50 hover:opacity-100" onClick={() => setEditingIndex({ tab: tabKey, index })}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const totalSelectedCount = selectedExpenses.length + selectedAdvances.length + selectedCredits.length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Stats Bar */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="gap-1">
            <Layers className="h-3 w-3" />
            {expenseRows.length} expenses
          </Badge>
          {advanceRows.length > 0 && (
            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
              <Banknote className="h-3 w-3" />
              {advanceRows.length} advances
            </Badge>
          )}
          {creditRows.length > 0 && (
            <Badge variant="outline" className="gap-1 text-success border-success/30">
              <TrendingUp className="h-3 w-3" />
              {creditRows.length} credits
            </Badge>
          )}
          {mergedCount > 0 && (
            <Badge className="gap-1 bg-blue-500/20 text-blue-600 border-blue-300 dark:text-blue-400">
              <CheckCircle className="h-3 w-3" />
              {mergedCount} merged
            </Badge>
          )}
          {duplicateCount > 0 && (
            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
              <AlertTriangle className="h-3 w-3" />
              {duplicateCount} duplicates
            </Badge>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-lg font-mono font-semibold text-destructive">{formatCurrency(expensesTotal)}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Credits / Discounts</p>
            <p className="text-lg font-mono font-semibold text-success">{formatCurrency(creditsTotal)}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Net Expense Impact</p>
            <p className={cn('text-lg font-mono font-semibold', netExpense >= 0 ? 'text-destructive' : 'text-success')}>
              {formatCurrency(netExpense)}
            </p>
          </div>
          <div className="rounded-lg border p-3 space-y-1 border-dashed">
            <p className="text-xs text-muted-foreground">Advances Taken</p>
            <p className="text-lg font-mono font-semibold text-amber-600">{formatCurrency(advancesTotal)}</p>
            <p className="text-[10px] text-muted-foreground">Non-P&L</p>
          </div>
        </div>

        <Tabs defaultValue="expenses">
          <TabsList>
            <TabsTrigger value="expenses" className="gap-1">
              <TrendingDown className="h-3 w-3" />
              Actual Expenses ({expenseRows.length})
            </TabsTrigger>
            <TabsTrigger value="advances" className="gap-1">
              <Banknote className="h-3 w-3" />
              Advances ({advanceRows.length})
            </TabsTrigger>
            <TabsTrigger value="credits" className="gap-1">
              <CreditCard className="h-3 w-3" />
              Credits ({creditRows.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="expenses">
            {renderTable(expenseRows, setExpenseRows, 'expenses', 'text-destructive')}
          </TabsContent>

          <TabsContent value="advances">
            {renderTable(advanceRows, setAdvanceRows, 'advances', 'text-amber-600')}
            <p className="text-xs text-muted-foreground mt-2">
              Advances are early access to funds (Non-P&L). They do not count toward your net expense total.
            </p>
          </TabsContent>

          <TabsContent value="credits">
            {renderTable(creditRows, setCreditRows, 'credits', 'text-success')}
            <p className="text-xs text-muted-foreground mt-2">
              Credits and reimbursements reduce your total expense burden.
            </p>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            {totalSelectedCount} items selected
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isImporting}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={totalSelectedCount === 0 || isImporting}
              className="gradient-gold text-primary-foreground"
            >
              {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm & Import Data ({totalSelectedCount})
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
