import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link, Unlink, Edit2, X, AlertTriangle, TrendingUp, Layers, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { extractJurisdictionFromVendor } from '@/lib/us-states';
import type { ReconciliationResult, ReconciledExpense, ReconciledEarning } from '@/lib/settlement-reconciliation';

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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selectedEarnings, setSelectedEarnings] = useState<Set<number>>(
    () => new Set(result.earnings.map((_, i) => i))
  );

  // Build expense rows with load/truck matching and duplicate detection
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(() => {
    return result.expenses.map(exp => {
      const matchedLoad = findMatchingLoad(exp.trip_number);
      const duplicateId = findDuplicateId(exp, matchedLoad);
      const isFuelType = ['Fuel', 'DEF'].includes(exp.expense_type);
      const jurisdiction = isFuelType ? extractJurisdictionFromVendor(exp.vendor || exp.description) : null;
      return {
        ...exp,
        selected: !duplicateId,
        matchedLoad,
        matchedTruck: findMatchingTruck(result.unitNumber),
        isDuplicate: duplicateId !== null,
        duplicateId,
        jurisdiction,
      };
    });
  });

  function findMatchingLoad(tripNumber: string | null): FleetLoad | null {
    if (!tripNumber) return null;
    const numericId = tripNumber.replace(/^[A-Z]{3}\s*/i, '').trim();
    return existingLoads.find(load => {
      if (!load.landstar_load_id) return false;
      const loadNumericId = load.landstar_load_id.replace(/^[A-Z]{3}\s*/i, '').trim();
      return loadNumericId === numericId || load.landstar_load_id === numericId;
    }) || null;
  }

  function findMatchingTruck(unitNumber: string | null): Truck | null {
    if (!unitNumber) return null;
    const cleanUnit = unitNumber.replace(/\D/g, '');
    return trucks.find(t => t.unit_number.includes(cleanUnit) || cleanUnit.includes(t.unit_number)) || null;
  }

  function findDuplicateId(expense: ReconciledExpense, matchedLoad: FleetLoad | null): string | null {
    const dup = existingExpenses.find(existing => {
      const sameDate = existing.expense_date === expense.date;
      const sameType = existing.expense_type === expense.expense_type;
      const sameAmount = Math.abs(existing.amount - Math.abs(expense.amount)) < 0.01;
      return sameDate && sameType && sameAmount;
    });
    return dup?.id || null;
  }

  const toggleExpense = (index: number) => {
    setExpenseRows(prev => prev.map((exp, i) => i === index ? { ...exp, selected: !exp.selected } : exp));
  };

  const toggleAllExpenses = (selected: boolean) => {
    setExpenseRows(prev => prev.map(exp => ({ ...exp, selected })));
  };

  const updateLoadMatch = (index: number, loadId: string | null) => {
    const matchedLoad = loadId ? existingLoads.find(l => l.id === loadId) || null : null;
    setExpenseRows(prev => prev.map((exp, i) => i === index ? { ...exp, matchedLoad } : exp));
    setEditingIndex(null);
  };

  const updateDate = (index: number, newDate: string) => {
    setExpenseRows(prev => prev.map((exp, i) => i === index ? { ...exp, date: newDate } : exp));
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const selectedExpenses = expenseRows.filter(e => e.selected);
  const duplicateCount = expenseRows.filter(e => e.isDuplicate).length;
  const mergedCount = expenseRows.filter(e => e.merged).length;
  const reimbursementCount = expenseRows.filter(e => e.is_reimbursement || e.is_discount).length;

  const expensesTotal = selectedExpenses
    .filter(e => !e.is_reimbursement && !e.is_discount)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const reimbursementsTotal = selectedExpenses
    .filter(e => e.is_reimbursement || e.is_discount)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const netTotal = expensesTotal - reimbursementsTotal;

  const earningsTotal = result.earnings
    .filter((_, i) => selectedEarnings.has(i))
    .reduce((sum, e) => sum + e.amount, 0);

  const handleImport = async () => {
    const toImport = selectedExpenses;
    if (toImport.length === 0) {
      toast.error('No expenses selected for import');
      return;
    }

    const validExpenses = toImport.filter(exp => {
      if (!exp.date || !/^\d{4}-\d{2}-\d{2}$/.test(exp.date)) return false;
      return true;
    });

    if (validExpenses.length === 0) {
      toast.error('No expenses with valid dates to import');
      return;
    }

    setIsImporting(true);
    try {
      const newExpenses = validExpenses.filter(exp => !exp.duplicateId);
      const duplicateExpenses = validExpenses.filter(exp => exp.duplicateId);
      let insertedCount = 0;
      let updatedCount = 0;

      if (newExpenses.length > 0) {
        const inserts = newExpenses.map(exp => ({
          expense_date: exp.date,
          expense_type: exp.is_reimbursement ? 'Reimbursement' : exp.expense_type,
          amount: exp.is_reimbursement ? -Math.abs(exp.amount) : Math.abs(exp.amount),
          description: exp.description,
          vendor: exp.vendor,
          gallons: exp.gallons,
          load_id: exp.matchedLoad?.id || null,
          truck_id: exp.matchedTruck?.id || null,
          notes: exp.is_reimbursement ? 'Reimbursement/Refund' : (exp.is_discount ? 'Discount/Credit' : null),
          jurisdiction: exp.jurisdiction,
          org_id: orgId,
        }));
        const { error } = await supabase.from('expenses').insert(inserts);
        if (error) throw error;
        insertedCount = newExpenses.length;
      }

      for (const exp of duplicateExpenses) {
        const { error } = await supabase
          .from('expenses')
          .update({
            expense_date: exp.date,
            expense_type: exp.is_reimbursement ? 'Reimbursement' : exp.expense_type,
            amount: exp.is_reimbursement ? -Math.abs(exp.amount) : Math.abs(exp.amount),
            description: exp.description,
            vendor: exp.vendor,
            gallons: exp.gallons,
            load_id: exp.matchedLoad?.id || null,
            truck_id: exp.matchedTruck?.id || null,
            notes: exp.is_reimbursement ? 'Reimbursement/Refund' : (exp.is_discount ? 'Discount/Credit' : null),
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
      toast.success(`Successfully imported: ${msgs.join(', ')} expenses`);
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Stats Bar */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="gap-1">
            <Layers className="h-3 w-3" />
            {expenseRows.length} expenses
          </Badge>
          {result.earnings.length > 0 && (
            <Badge variant="outline" className="gap-1 text-success border-success/30">
              <TrendingUp className="h-3 w-3" />
              {result.earnings.length} earnings
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

        <Tabs defaultValue="expenses">
          <TabsList>
            <TabsTrigger value="expenses">
              Deductions / Expenses ({expenseRows.length})
            </TabsTrigger>
            <TabsTrigger value="earnings">
              Earnings / Loads ({result.earnings.length})
            </TabsTrigger>
          </TabsList>

          {/* === EXPENSES TAB === */}
          <TabsContent value="expenses">
            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedExpenses.length === expenseRows.length}
                        onCheckedChange={(checked) => toggleAllExpenses(!!checked)}
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
                  {expenseRows.map((expense, index) => (
                    <TableRow
                      key={index}
                      className={cn(
                        (expense.is_discount || expense.is_reimbursement) && 'bg-success/5',
                        expense.isDuplicate && 'bg-warning/10',
                        !expense.selected && 'opacity-50'
                      )}
                    >
                      <TableCell>
                        <Checkbox checked={expense.selected} onCheckedChange={() => toggleExpense(index)} />
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={expense.date}
                            onChange={(e) => updateDate(index, e.target.value)}
                            className="bg-transparent border-b border-dashed border-muted-foreground/40 hover:border-primary focus:border-primary focus:outline-none text-sm w-32 cursor-pointer"
                          />
                          {expense.isDuplicate && (
                            <span title="Potential duplicate">
                              <AlertTriangle className="h-3 w-3 text-warning" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(expense.is_reimbursement || expense.is_discount) && (
                            <TrendingUp className="h-3 w-3 text-success" />
                          )}
                          <Badge
                            variant={(expense.is_discount || expense.is_reimbursement) ? 'secondary' : 'outline'}
                            className={cn(
                              'text-xs',
                              (expense.is_reimbursement || expense.is_discount) && 'bg-success/20 text-success border-success/30'
                            )}
                          >
                            {expense.is_reimbursement ? 'Reimbursement' : expense.expense_type}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-40 truncate" title={expense.description}>
                        {expense.vendor || expense.description}
                        {expense.gallons && (
                          <span className="text-xs text-muted-foreground ml-1">({expense.gallons.toFixed(1)} gal)</span>
                        )}
                      </TableCell>
                      <TableCell className={cn(
                        'text-right font-mono text-sm font-medium',
                        (expense.is_discount || expense.is_reimbursement) ? 'text-success' : 'text-destructive'
                      )}>
                        {(expense.is_discount || expense.is_reimbursement) ? '+' : '-'}{formatCurrency(Math.abs(expense.amount))}
                      </TableCell>
                      <TableCell>
                        {expense.merged ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge className="text-xs bg-blue-500/20 text-blue-600 border-blue-300 dark:text-blue-400 cursor-help">
                                Merged
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Cross-referenced from:</p>
                              <ul className="text-xs list-disc pl-3">
                                {expense.sources.map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">{expense.sources[0]}</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        {editingIndex === index ? (
                          <div className="flex items-center gap-1">
                            <Select
                              value={expense.matchedLoad?.id || 'none'}
                              onValueChange={(v) => updateLoadMatch(index, v === 'none' ? null : v)}
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
                            {expense.matchedLoad ? (
                              <div className="flex items-center gap-1 text-xs">
                                <Link className="h-3 w-3 text-success" />
                                <span className="text-success font-mono">{expense.matchedLoad.landstar_load_id}</span>
                              </div>
                            ) : expense.trip_number ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Unlink className="h-3 w-3" />
                                <span className="font-mono">{expense.trip_number}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-1 opacity-50 hover:opacity-100" onClick={() => setEditingIndex(index)}>
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
          </TabsContent>

          {/* === EARNINGS TAB === */}
          <TabsContent value="earnings">
            {result.earnings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No earnings data found. Upload a Contractor Statement PDF to see revenue lines.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedEarnings.size === result.earnings.length}
                          onCheckedChange={(checked) => {
                            setSelectedEarnings(checked ? new Set(result.earnings.map((_, i) => i)) : new Set());
                          }}
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Freight Bill #</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.earnings.map((earning, index) => (
                      <TableRow key={index} className={cn(!selectedEarnings.has(index) && 'opacity-50')}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEarnings.has(index)}
                            onCheckedChange={() => {
                              setSelectedEarnings(prev => {
                                const next = new Set(prev);
                                next.has(index) ? next.delete(index) : next.add(index);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-sm">{earning.date}</TableCell>
                        <TableCell className="text-sm max-w-48 truncate">{earning.description}</TableCell>
                        <TableCell className="text-sm font-mono">{earning.trip_number || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium text-success">
                          +{formatCurrency(earning.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {earning.sources.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Earnings are display-only for cross-reference. Only expenses are imported.
            </p>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm space-x-2 flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground">Selected:</span>
            <span className="font-medium">{selectedExpenses.length}</span>
            {reimbursementCount > 0 && (
              <Badge variant="outline" className="text-xs text-success border-success/30">
                <TrendingUp className="h-3 w-3 mr-1" />
                {reimbursementCount} refunds
              </Badge>
            )}
            <span className="text-muted-foreground">• Net:</span>
            <span className={cn('font-mono font-medium', netTotal >= 0 ? 'text-destructive' : 'text-success')}>
              {formatCurrency(netTotal)}
            </span>
            {earningsTotal > 0 && (
              <>
                <span className="text-muted-foreground">• Earnings:</span>
                <span className="font-mono font-medium text-success">{formatCurrency(earningsTotal)}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isImporting}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={selectedExpenses.length === 0 || isImporting}
              className="gradient-gold text-primary-foreground"
            >
              {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm & Import Data ({selectedExpenses.length})
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
