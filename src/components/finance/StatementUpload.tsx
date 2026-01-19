import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X, Link, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExtractedExpense {
  date: string;
  expense_type: string;
  amount: number;
  trip_number: string | null;
  description: string;
  vendor: string | null;
  gallons: number | null;
  is_discount: boolean;
}

interface ParsedStatement {
  statement_type: 'card_activity' | 'contractor';
  period_start: string | null;
  period_end: string | null;
  unit_number: string | null;
  expenses: ExtractedExpense[];
}

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

interface StatementUploadProps {
  existingLoads: FleetLoad[];
  trucks: Truck[];
  onExpensesImported: () => void;
}

interface ExpenseWithMatch extends ExtractedExpense {
  selected: boolean;
  matchedLoad: FleetLoad | null;
  matchedTruck: Truck | null;
}

export function StatementUpload({ existingLoads, trucks, onExpensesImported }: StatementUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [statementData, setStatementData] = useState<ParsedStatement | null>(null);
  const [expenses, setExpenses] = useState<ExpenseWithMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const findMatchingLoad = (tripNumber: string | null): FleetLoad | null => {
    if (!tripNumber) return null;
    // Remove any letter prefix (e.g., "DLE 6065079" -> "6065079")
    const numericId = tripNumber.replace(/^[A-Z]{3}\s*/i, '').trim();
    
    return existingLoads.find(load => {
      if (!load.landstar_load_id) return false;
      const loadNumericId = load.landstar_load_id.replace(/^[A-Z]{3}\s*/i, '').trim();
      return loadNumericId === numericId || load.landstar_load_id === numericId;
    }) || null;
  };

  const findMatchingTruck = (unitNumber: string | null): Truck | null => {
    if (!unitNumber) return null;
    const cleanUnit = unitNumber.replace(/\D/g, '');
    return trucks.find(t => t.unit_number.includes(cleanUnit) || cleanUnit.includes(t.unit_number)) || null;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (file: File) => {
    if (!file.type.includes('pdf')) {
      toast.error('Please upload a PDF file');
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);
    setError(null);
    setStatementData(null);
    setExpenses([]);

    try {
      const pdfBase64 = await convertFileToBase64(file);
      
      if (!pdfBase64 || pdfBase64.length < 100) {
        throw new Error('Could not read PDF file.');
      }

      console.log('PDF base64 length:', pdfBase64.length);

      const { data, error: fnError } = await supabase.functions.invoke('parse-landstar-statement', {
        body: { pdfBase64 },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to parse statement');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      console.log('Extracted statement data:', data);
      setStatementData(data);

      // Match truck from statement
      const statementTruck = findMatchingTruck(data.unit_number);

      // Process expenses and match with loads
      const processedExpenses: ExpenseWithMatch[] = (data.expenses || []).map((exp: ExtractedExpense) => ({
        ...exp,
        selected: true,
        matchedLoad: findMatchingLoad(exp.trip_number),
        matchedTruck: exp.trip_number ? null : statementTruck, // Only assign truck if no trip number
      }));

      setExpenses(processedExpenses);
      
      const matchedCount = processedExpenses.filter((e: ExpenseWithMatch) => e.matchedLoad).length;
      toast.success(`Extracted ${processedExpenses.length} expenses (${matchedCount} matched to existing loads)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process file';
      setError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(f => f.type === 'application/pdf');
    
    if (pdfFile) {
      processFile(pdfFile);
    } else {
      toast.error('Please drop a PDF file');
    }
  }, [existingLoads, trucks]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const toggleExpense = (index: number) => {
    setExpenses(prev => prev.map((exp, i) => 
      i === index ? { ...exp, selected: !exp.selected } : exp
    ));
  };

  const toggleAll = (selected: boolean) => {
    setExpenses(prev => prev.map(exp => ({ ...exp, selected })));
  };

  const handleImport = async (importAll: boolean = false) => {
    const toImport = importAll ? expenses : expenses.filter(e => e.selected);
    
    if (toImport.length === 0) {
      toast.error('No expenses selected for import');
      return;
    }

    setIsImporting(true);

    try {
      const expenseInserts = toImport.map(exp => ({
        expense_date: exp.date,
        expense_type: exp.expense_type,
        amount: Math.abs(exp.amount), // Store as positive, the type indicates if it's a discount
        description: exp.description,
        vendor: exp.vendor,
        gallons: exp.gallons,
        load_id: exp.matchedLoad?.id || null,
        truck_id: exp.matchedTruck?.id || null,
        notes: exp.is_discount ? 'Discount/Credit' : null,
      }));

      const { error } = await supabase.from('expenses').insert(expenseInserts);

      if (error) throw error;

      toast.success(`Successfully imported ${toImport.length} expenses`);
      handleCancel();
      onExpensesImported();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import expenses';
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancel = () => {
    setStatementData(null);
    setExpenses([]);
    setFileName(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const selectedCount = expenses.filter(e => e.selected).length;
  const selectedTotal = expenses.filter(e => e.selected).reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5" />
          Import from Landstar Statements
        </CardTitle>
        <CardDescription>
          Upload Card Activity or Contractor Statements to automatically extract and import expenses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        {!statementData && (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer text-center",
              isDragging && "border-primary bg-primary/5",
              isProcessing && "opacity-50 pointer-events-none",
              !isDragging && !isProcessing && "hover:border-primary/50 hover:bg-muted/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
                <p className="text-sm font-medium">Processing {fileName}...</p>
                <p className="text-xs text-muted-foreground">Extracting expenses with AI</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Drop Statement PDF here</p>
                <p className="text-xs text-muted-foreground">Supports Card Activity & Contractor Statements</p>
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Error Display */}
        {error && (
          <div className="border border-destructive bg-destructive/5 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Failed to parse document</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Extracted Expenses Preview */}
        {statementData && expenses.length > 0 && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium">
                    Extracted {expenses.length} expenses from {fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {statementData.statement_type === 'card_activity' ? 'Card Activity Statement' : 'Contractor Statement'}
                    {statementData.period_start && ` • ${statementData.period_start} to ${statementData.period_end}`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Expenses Table */}
            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={selectedCount === expenses.length}
                        onCheckedChange={(checked) => toggleAll(!!checked)}
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Load Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense, index) => (
                    <TableRow 
                      key={index}
                      className={cn(
                        expense.is_discount && "bg-success/5",
                        !expense.selected && "opacity-50"
                      )}
                    >
                      <TableCell>
                        <Checkbox 
                          checked={expense.selected}
                          onCheckedChange={() => toggleExpense(index)}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{expense.date}</TableCell>
                      <TableCell>
                        <Badge variant={expense.is_discount ? "secondary" : "outline"} className="text-xs">
                          {expense.expense_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-48 truncate" title={expense.description}>
                        {expense.vendor || expense.description}
                        {expense.gallons && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({expense.gallons.toFixed(1)} gal)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono text-sm",
                        expense.is_discount ? "text-success" : "text-destructive"
                      )}>
                        {expense.is_discount ? '-' : ''}{formatCurrency(Math.abs(expense.amount))}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary & Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm">
                <span className="text-muted-foreground">Selected: </span>
                <span className="font-medium">{selectedCount} expenses</span>
                <span className="text-muted-foreground ml-2">• Total: </span>
                <span className={cn(
                  "font-mono font-medium",
                  selectedTotal >= 0 ? "text-destructive" : "text-success"
                )}>
                  {formatCurrency(selectedTotal)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} disabled={isImporting}>
                  Cancel
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleImport(false)} 
                  disabled={selectedCount === 0 || isImporting}
                >
                  {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Import Selected ({selectedCount})
                </Button>
                <Button 
                  onClick={() => handleImport(true)} 
                  disabled={isImporting}
                  className="gradient-gold text-primary-foreground"
                >
                  {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Import All ({expenses.length})
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
