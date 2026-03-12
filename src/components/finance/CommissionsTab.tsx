import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Briefcase, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';

type AgentCommission = Database['public']['Tables']['agent_commissions']['Row'];
type AgentCommissionInsert = Database['public']['Tables']['agent_commissions']['Insert'];

interface CommissionsTabProps {
  filteredCommissions: AgentCommission[];
  commissionTotals: any;
  commissionsLoading: boolean;
}

export function CommissionsTab({ filteredCommissions, commissionTotals, commissionsLoading }: CommissionsTabProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentCommission | null>(null);
  const [formData, setFormData] = useState<Partial<AgentCommissionInsert>>({});

  const openDialog = (commission?: AgentCommission) => {
    setEditing(commission || null);
    setFormData(commission || { status: 'pending', commission_rate: 0, commission_amount: 0 });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setFormData({});
  };

  const createMutation = useMutation({
    mutationFn: async (commission: AgentCommissionInsert) => {
      const { error } = await supabase.from('agent_commissions').insert(commission);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent_commissions'] });
      toast.success('Commission added');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgentCommission> & { id: string }) => {
      const { error } = await supabase.from('agent_commissions').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent_commissions'] });
      toast.success('Commission updated');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agent_commissions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent_commissions'] });
      toast.success('Commission deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agent_name) {
      toast.error('Agent name is required');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...formData });
    } else {
      createMutation.mutate(formData as AgentCommissionInsert);
    }
  };

  return (
    <>
      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Agent Commissions
            </CardTitle>
            <CardDescription>Track agent commissions from loads</CardDescription>
          </div>
          <Button onClick={() => openDialog()} className="gradient-gold text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" /> Add Commission
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total Commissions</p>
              <p className="text-2xl font-bold">{commissionTotals.count}</p>
            </div>
            <div className="p-4 bg-success/10 rounded-lg">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold text-success">{formatCurrency(commissionTotals.amount)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payout Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissionsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">Loading...</TableCell>
                  </TableRow>
                ) : filteredCommissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No commissions for this period</TableCell>
                  </TableRow>
                ) : (
                  filteredCommissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell className="font-medium">{commission.agent_name}</TableCell>
                      <TableCell className="text-right">{commission.commission_rate}%</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatCurrency(commission.commission_amount)}</TableCell>
                      <TableCell>{commission.payout_date || '-'}</TableCell>
                      <TableCell><StatusBadge status={commission.status} /></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(commission)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(commission.id)}>
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
            <DialogTitle>{editing ? 'Edit Commission' : 'Add Commission'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Agent Name *</Label>
              <Input value={formData.agent_name || ''} onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rate (%)</Label>
                <Input type="number" step="0.01" value={formData.commission_rate || ''} onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" value={formData.commission_amount || ''} onChange={(e) => setFormData({ ...formData, commission_amount: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payout Date</Label>
                <Input type="date" value={formData.payout_date || ''} onChange={(e) => setFormData({ ...formData, payout_date: e.target.value })} />
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
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editing ? 'Save Changes' : 'Add Commission'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
