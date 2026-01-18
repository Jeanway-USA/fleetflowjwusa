import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Pencil, Trash2, TrendingUp, TrendingDown, Users } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type GeneralLedger = Database['public']['Tables']['general_ledger']['Row'];
type GeneralLedgerInsert = Database['public']['Tables']['general_ledger']['Insert'];
type DriverPayroll = Database['public']['Tables']['driver_payroll']['Row'];
type Driver = Database['public']['Tables']['drivers']['Row'];

const categories = ['Revenue', 'Fuel', 'Repairs', 'Insurance', 'Tolls', 'Equipment', 'Payroll', 'Office', 'Other'];

export default function Ledger() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<GeneralLedger | null>(null);
  const [formData, setFormData] = useState<Partial<GeneralLedgerInsert>>({});

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['general_ledger'],
    queryFn: async () => {
      const { data, error } = await supabase.from('general_ledger').select('*').order('transaction_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payrolls = [] } = useQuery({
    queryKey: ['driver_payroll'],
    queryFn: async () => {
      const { data, error } = await supabase.from('driver_payroll').select('*').order('period_end', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (entry: GeneralLedgerInsert) => {
      const { error } = await supabase.from('general_ledger').insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['general_ledger'] });
      toast.success('Entry added');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<GeneralLedger> & { id: string }) => {
      const { error } = await supabase.from('general_ledger').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['general_ledger'] });
      toast.success('Entry updated');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('general_ledger').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['general_ledger'] });
      toast.success('Entry deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (entry?: GeneralLedger) => {
    setEditingEntry(entry || null);
    setFormData(entry || { transaction_type: 'income', category: 'Revenue' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEntry(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.category || !formData.transaction_type) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, ...formData });
    } else {
      createMutation.mutate(formData as GeneralLedgerInsert);
    }
  };

  // Calculate totals
  const totalIncome = entries.filter(e => e.transaction_type === 'income').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalExpenses = entries.filter(e => e.transaction_type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalPayroll = payrolls.reduce((sum, p) => sum + Number(p.net_pay || 0), 0);
  const netProfit = totalIncome - totalExpenses - totalPayroll;

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : '-';
  };

  const payrollColumns = [
    { key: 'driver_id', header: 'Driver', render: (p: DriverPayroll) => getDriverName(p.driver_id) },
    { key: 'period_start', header: 'Period Start' },
    { key: 'period_end', header: 'Period End' },
    { key: 'gross_pay', header: 'Gross Pay', render: (p: DriverPayroll) => `$${Number(p.gross_pay).toFixed(2)}` },
    { key: 'fuel_deductions', header: 'Fuel Ded.', render: (p: DriverPayroll) => `$${(p.fuel_deductions || 0).toFixed(2)}` },
    { key: 'net_pay', header: 'Net Pay', render: (p: DriverPayroll) => <span className="font-semibold text-primary">${(p.net_pay || 0).toFixed(2)}</span> },
    { key: 'status', header: 'Status', render: (p: DriverPayroll) => <span className={`capitalize ${p.status === 'paid' ? 'text-success' : 'text-muted-foreground'}`}>{p.status}</span> },
  ];

  const columns = [
    { key: 'transaction_date', header: 'Date' },
    { key: 'description', header: 'Description' },
    { key: 'category', header: 'Category' },
    { 
      key: 'transaction_type', 
      header: 'Type', 
      render: (e: GeneralLedger) => (
        <span className={e.transaction_type === 'income' ? 'text-success' : 'text-destructive'}>
          {e.transaction_type === 'income' ? '↑ Income' : '↓ Expense'}
        </span>
      )
    },
    { 
      key: 'amount', 
      header: 'Amount', 
      render: (e: GeneralLedger) => (
        <span className={e.transaction_type === 'income' ? 'text-success font-medium' : 'text-destructive font-medium'}>
          {e.transaction_type === 'income' ? '+' : '-'}${Math.abs(Number(e.amount)).toFixed(2)}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (entry: GeneralLedger) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(entry); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(entry.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="General Ledger" description="Track income and expenses" action={{ label: 'Add Entry', onClick: () => openDialog() }} />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">${totalIncome.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">${totalExpenses.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payroll</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">${totalPayroll.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${netProfit.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ledger" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ledger">General Ledger</TabsTrigger>
          <TabsTrigger value="payroll">Driver Payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <DataTable columns={columns} data={entries} loading={isLoading} emptyMessage="No ledger entries yet" />
        </TabsContent>
        <TabsContent value="payroll">
          <DataTable columns={payrollColumns} data={payrolls} loading={isLoading} emptyMessage="No payroll records yet" />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Entry' : 'Add Ledger Entry'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transaction_date">Date</Label>
                <Input id="transaction_date" type="date" value={formData.transaction_date || ''} onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transaction_type">Type *</Label>
                <Select value={formData.transaction_type || 'income'} onValueChange={(v) => setFormData({ ...formData, transaction_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Input id="description" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={formData.category || ''} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($) *</Label>
                <Input id="amount" type="number" step="0.01" value={formData.amount || ''} onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingEntry ? 'Save Changes' : 'Add Entry'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
