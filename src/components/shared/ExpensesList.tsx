import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, DollarSign, Fuel, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { US_STATES } from '@/lib/us-states';

const EXPENSE_TYPES = [
  'Fuel',
  'DEF',
  'Truck Payment',
  'Trailer Payment',
  'Licensing/Permits',
  'Insurance',
  'LCN',
  'Maintenance',
  'Cell Phone',
  'Trip Scanning',
  'Card Load',
  'IFTA',
  'PrePass/Scale',
  'Tolls',
  'Parking',
  'Misc',
];

const GALLONS_EXPENSE_TYPES = ['Fuel', 'DEF'];

interface ExpensesListProps {
  relatedType: 'load' | 'truck';
  relatedId: string;
  title?: string;
}

export function ExpensesList({ relatedType, relatedId, title = 'Expenses' }: ExpensesListProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    expense_type: 'Fuel',
    amount: '',
    gallons: '',
    vendor: '',
    description: '',
    jurisdiction: '',
    expense_date: new Date().toISOString().split('T')[0],
  });

  const queryKey = relatedType === 'load' ? ['expenses', 'load', relatedId] : ['expenses', 'truck', relatedId];

  const { data: expenses = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const query = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (relatedType === 'load') {
        query.eq('load_id', relatedId);
      } else {
        query.eq('truck_id', relatedId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!relatedId,
  });

  const createMutation = useMutation({
    mutationFn: async (expense: any) => {
      const { error } = await supabase.from('expenses').insert(expense);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense added');
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      expense_type: 'Fuel',
      amount: '',
      gallons: '',
      vendor: '',
      description: '',
      jurisdiction: '',
      expense_date: new Date().toISOString().split('T')[0],
    });
    setShowAddForm(false);
  };

  const handleAddExpense = () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Amount is required');
      return;
    }

    const expense: any = {
      expense_type: formData.expense_type,
      amount: parseFloat(formData.amount),
      expense_date: formData.expense_date,
      vendor: formData.vendor || null,
      description: formData.description || null,
      gallons: GALLONS_EXPENSE_TYPES.includes(formData.expense_type) && formData.gallons ? parseFloat(formData.gallons) : null,
      jurisdiction: GALLONS_EXPENSE_TYPES.includes(formData.expense_type) && formData.jurisdiction ? formData.jurisdiction : null,
    };

    if (relatedType === 'load') {
      expense.load_id = relatedId;
    } else {
      expense.truck_id = relatedId;
    }

    createMutation.mutate(expense);
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return format(parseISO(date), 'MM/dd/yyyy');
  };

  const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">{title}</h3>
          <span className="text-sm text-muted-foreground">({expenses.length} items)</span>
        </div>
        {!showAddForm && (
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Expense
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.expense_type} onValueChange={(v) => setFormData({ ...formData, expense_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input 
                type="date" 
                value={formData.expense_date} 
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount ($) *</Label>
              <Input 
                type="number" 
                step="0.01" 
                placeholder="0.00" 
                value={formData.amount} 
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })} 
                required
              />
            </div>
            {GALLONS_EXPENSE_TYPES.includes(formData.expense_type) && (
              <div className="space-y-2">
                <Label>Gallons</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={formData.gallons} 
                  onChange={(e) => setFormData({ ...formData, gallons: e.target.value })} 
                />
              </div>
            )}
            {!GALLONS_EXPENSE_TYPES.includes(formData.expense_type) && (
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input 
                  placeholder="Vendor name" 
                  value={formData.vendor} 
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })} 
                />
              </div>
            )}
          </div>

          {GALLONS_EXPENSE_TYPES.includes(formData.expense_type) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input 
                  placeholder="Fuel stop / vendor" 
                  value={formData.vendor} 
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> State (IFTA)
                </Label>
                <Select 
                  value={formData.jurisdiction || 'none'} 
                  onValueChange={(v) => setFormData({ ...formData, jurisdiction: v === 'none' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {US_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Description</Label>
            <Input 
              placeholder="Optional description" 
              value={formData.description} 
              onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
            <Button
              type="button"
              onClick={handleAddExpense}
              disabled={createMutation.isPending}
              className="gradient-gold text-primary-foreground"
            >
              {createMutation.isPending ? 'Adding...' : 'Add Expense'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-center text-muted-foreground py-4">Loading expenses...</p>
      ) : expenses.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No expenses recorded yet.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Gallons</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense: any) => (
                <TableRow key={expense.id}>
                  <TableCell>{formatDate(expense.expense_date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {GALLONS_EXPENSE_TYPES.includes(expense.expense_type) && <Fuel className="h-4 w-4 text-muted-foreground" />}
                      {expense.expense_type}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{expense.vendor || '-'}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(expense.amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {expense.gallons ? `${expense.gallons} gal` : '-'}
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteMutation.mutate(expense.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">{formatCurrency(totalExpenses)}</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
