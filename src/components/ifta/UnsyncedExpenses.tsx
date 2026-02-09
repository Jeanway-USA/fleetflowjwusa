import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { US_STATES } from '@/lib/us-states';
import { cn } from '@/lib/utils';

interface UnsyncedExpense {
  id: string;
  expense_date: string;
  expense_type: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  gallons: number | null;
  truck_id: string | null;
}

interface UnsyncedExpensesProps {
  expenses: UnsyncedExpense[];
  trucks: { id: string; unit_number: string }[];
}

export function UnsyncedExpenses({ expenses, trucks }: UnsyncedExpensesProps) {
  const queryClient = useQueryClient();
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const updateJurisdictionMutation = useMutation({
    mutationFn: async ({ expenseId, jurisdiction }: { expenseId: string; jurisdiction: string }) => {
      setSavingId(expenseId);
      const { error } = await supabase
        .from('expenses')
        .update({ jurisdiction })
        .eq('id', expenseId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      queryClient.invalidateQueries({ queryKey: ['unsynced_fuel_expenses'] });
      toast.success('Jurisdiction set — fuel purchase synced');
      setSelectedJurisdictions(prev => {
        const next = { ...prev };
        delete next[variables.expenseId];
        return next;
      });
    },
    onError: (error: any) => {
      toast.error('Failed to update: ' + error.message);
    },
    onSettled: () => setSavingId(null),
  });

  const getTruckName = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find(t => t.id === truckId);
    return truck ? `#${truck.unit_number}` : '-';
  };

  if (expenses.length === 0) return null;

  return (
    <Card className="card-elevated mt-6 border-warning/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div>
            <CardTitle className="text-base">Expenses Missing Jurisdiction</CardTitle>
            <CardDescription>
              {expenses.length} fuel expense{expenses.length !== 1 ? 's' : ''} couldn't be auto-synced. 
              Assign a state to sync them.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Vendor / Description</TableHead>
              <TableHead>Truck</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Gallons</TableHead>
              <TableHead>Jurisdiction</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map(exp => (
              <TableRow key={exp.id}>
                <TableCell>{format(parseISO(exp.expense_date), 'MM/dd/yyyy')}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {exp.expense_type}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate" title={exp.description || exp.vendor || ''}>
                  {exp.vendor || exp.description || '-'}
                </TableCell>
                <TableCell>{getTruckName(exp.truck_id)}</TableCell>
                <TableCell className={cn(
                  "text-right font-medium",
                  exp.expense_type === 'Fuel Discount' ? 'text-success' : 'text-destructive'
                )}>
                  {exp.expense_type === 'Fuel Discount' ? '-' : ''}${exp.amount.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  {exp.gallons?.toFixed(2) || '-'}
                </TableCell>
                <TableCell>
                  <Select
                    value={selectedJurisdictions[exp.id] || ''}
                    onValueChange={(v) =>
                      setSelectedJurisdictions(prev => ({ ...prev, [exp.id]: v }))
                    }
                  >
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    disabled={
                      !selectedJurisdictions[exp.id] ||
                      savingId === exp.id
                    }
                    onClick={() =>
                      updateJurisdictionMutation.mutate({
                        expenseId: exp.id,
                        jurisdiction: selectedJurisdictions[exp.id],
                      })
                    }
                  >
                    {savingId === exp.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Save
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
