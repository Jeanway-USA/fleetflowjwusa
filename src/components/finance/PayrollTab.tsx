import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';

type DriverPayroll = Database['public']['Tables']['driver_payroll']['Row'];
type DriverPayrollInsert = Database['public']['Tables']['driver_payroll']['Insert'];

interface PayrollTabProps {
  filteredPayrolls: DriverPayroll[];
  payrollTotals: any;
  payrollsLoading: boolean;
  drivers: any[];
  getDriverName: (id: string) => string;
}

export function PayrollTab({ filteredPayrolls, payrollTotals, payrollsLoading, drivers, getDriverName }: PayrollTabProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DriverPayroll | null>(null);
  const [formData, setFormData] = useState<Partial<DriverPayrollInsert>>({});

  const openDialog = (payroll?: DriverPayroll) => {
    setEditing(payroll || null);
    setFormData(payroll || { status: 'pending', gross_pay: 0 });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setFormData({});
  };

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
    mutationFn: async ({ id, net_pay, ...updates }: Partial<DriverPayroll> & { id: string }) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.driver_id || !formData.period_start || !formData.period_end) {
      toast.error('Driver, period start and end are required');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...formData });
    } else {
      createMutation.mutate(formData as DriverPayrollInsert);
    }
  };

  return (
    <>
      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Driver Payroll
            </CardTitle>
            <CardDescription>Manage driver pay and deductions</CardDescription>
          </div>
          <Button onClick={() => openDialog()} className="gradient-gold text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" /> Add Payroll
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total Gross Pay</p>
              <p className="text-2xl font-bold">{formatCurrency(payrollTotals.grossPay)}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total Deductions</p>
              <p className="text-2xl font-bold text-destructive">
                {formatCurrency(payrollTotals.fuelDeductions + payrollTotals.repairDeductions + payrollTotals.otherDeductions)}
              </p>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg">
              <p className="text-sm text-muted-foreground">Total Net Pay</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(payrollTotals.netPay)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Period Start</TableHead>
                  <TableHead>Period End</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Fuel Ded.</TableHead>
                  <TableHead className="text-right">Repair Ded.</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollsLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">Loading...</TableCell>
                  </TableRow>
                ) : filteredPayrolls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No payroll records for this period</TableCell>
                  </TableRow>
                ) : (
                  filteredPayrolls.map((payroll) => (
                    <TableRow key={payroll.id}>
                      <TableCell className="font-medium">{getDriverName(payroll.driver_id)}</TableCell>
                      <TableCell>{payroll.period_start}</TableCell>
                      <TableCell>{payroll.period_end}</TableCell>
                      <TableCell className="text-right">{formatCurrency(payroll.gross_pay)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(payroll.fuel_deductions || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(payroll.repair_deductions || 0)}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatCurrency(payroll.net_pay || 0)}</TableCell>
                      <TableCell><StatusBadge status={payroll.status} /></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(payroll)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(payroll.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Payroll' : 'Add Payroll Entry'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Driver *</Label>
              <Select value={formData.driver_id || ''} onValueChange={(v) => setFormData({ ...formData, driver_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start *</Label>
                <Input type="date" value={formData.period_start || ''} onChange={(e) => setFormData({ ...formData, period_start: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Period End *</Label>
                <Input type="date" value={formData.period_end || ''} onChange={(e) => setFormData({ ...formData, period_end: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gross Pay ($) *</Label>
                <Input type="number" step="0.01" value={formData.gross_pay || ''} onChange={(e) => setFormData({ ...formData, gross_pay: parseFloat(e.target.value) || 0 })} required />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
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
                <Label>Fuel Ded. ($)</Label>
                <Input type="number" step="0.01" value={formData.fuel_deductions || ''} onChange={(e) => setFormData({ ...formData, fuel_deductions: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Repair Ded. ($)</Label>
                <Input type="number" step="0.01" value={formData.repair_deductions || ''} onChange={(e) => setFormData({ ...formData, repair_deductions: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Other Ded. ($)</Label>
                <Input type="number" step="0.01" value={formData.other_deductions || ''} onChange={(e) => setFormData({ ...formData, other_deductions: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editing ? 'Save Changes' : 'Add Payroll'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
