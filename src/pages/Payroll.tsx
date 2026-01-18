import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type DriverPayroll = Database['public']['Tables']['driver_payroll']['Row'];
type DriverPayrollInsert = Database['public']['Tables']['driver_payroll']['Insert'];
type Driver = Database['public']['Tables']['drivers']['Row'];

export default function Payroll() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<DriverPayroll | null>(null);
  const [formData, setFormData] = useState<Partial<DriverPayrollInsert>>({});

  const { data: payrolls = [], isLoading } = useQuery({
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
    mutationFn: async (payroll: DriverPayrollInsert) => {
      const { error } = await supabase.from('driver_payroll').insert(payroll);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver_payroll'] });
      toast.success('Payroll entry created');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DriverPayroll> & { id: string }) => {
      const { error } = await supabase.from('driver_payroll').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver_payroll'] });
      toast.success('Payroll updated');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('driver_payroll').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver_payroll'] });
      toast.success('Payroll entry deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (payroll?: DriverPayroll) => {
    setEditingPayroll(payroll || null);
    setFormData(payroll || { status: 'pending', gross_pay: 0 });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingPayroll(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.driver_id || !formData.period_start || !formData.period_end) {
      toast.error('Driver, period start and end are required');
      return;
    }
    if (editingPayroll) {
      updateMutation.mutate({ id: editingPayroll.id, ...formData });
    } else {
      createMutation.mutate(formData as DriverPayrollInsert);
    }
  };

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : '-';
  };

  const columns = [
    { key: 'driver_id', header: 'Driver', render: (p: DriverPayroll) => getDriverName(p.driver_id) },
    { key: 'period_start', header: 'Period Start' },
    { key: 'period_end', header: 'Period End' },
    { key: 'gross_pay', header: 'Gross', render: (p: DriverPayroll) => `$${p.gross_pay.toFixed(2)}` },
    { key: 'fuel_deductions', header: 'Fuel Ded.', render: (p: DriverPayroll) => `$${(p.fuel_deductions || 0).toFixed(2)}` },
    { key: 'repair_deductions', header: 'Repair Ded.', render: (p: DriverPayroll) => `$${(p.repair_deductions || 0).toFixed(2)}` },
    { key: 'net_pay', header: 'Net Pay', render: (p: DriverPayroll) => <span className="font-semibold text-primary">${(p.net_pay || 0).toFixed(2)}</span> },
    { key: 'status', header: 'Status', render: (p: DriverPayroll) => <StatusBadge status={p.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (payroll: DriverPayroll) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(payroll); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(payroll.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Driver Payroll" description="Manage driver pay and deductions" action={{ label: 'Add Payroll', onClick: () => openDialog() }} />
      <DataTable columns={columns} data={payrolls} loading={isLoading} emptyMessage="No payroll records yet" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPayroll ? 'Edit Payroll' : 'Add Payroll Entry'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="driver_id">Driver *</Label>
              <Select value={formData.driver_id || ''} onValueChange={(v) => setFormData({ ...formData, driver_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period_start">Period Start *</Label>
                <Input id="period_start" type="date" value={formData.period_start || ''} onChange={(e) => setFormData({ ...formData, period_start: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period_end">Period End *</Label>
                <Input id="period_end" type="date" value={formData.period_end || ''} onChange={(e) => setFormData({ ...formData, period_end: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gross_pay">Gross Pay ($) *</Label>
                <Input id="gross_pay" type="number" step="0.01" value={formData.gross_pay || ''} onChange={(e) => setFormData({ ...formData, gross_pay: parseFloat(e.target.value) || 0 })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'pending'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fuel_deductions">Fuel Ded. ($)</Label>
                <Input id="fuel_deductions" type="number" step="0.01" value={formData.fuel_deductions || ''} onChange={(e) => setFormData({ ...formData, fuel_deductions: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repair_deductions">Repair Ded. ($)</Label>
                <Input id="repair_deductions" type="number" step="0.01" value={formData.repair_deductions || ''} onChange={(e) => setFormData({ ...formData, repair_deductions: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="other_deductions">Other Ded. ($)</Label>
                <Input id="other_deductions" type="number" step="0.01" value={formData.other_deductions || ''} onChange={(e) => setFormData({ ...formData, other_deductions: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingPayroll ? 'Save Changes' : 'Add Payroll'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
