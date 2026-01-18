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

type AgentCommission = Database['public']['Tables']['agent_commissions']['Row'];
type AgentCommissionInsert = Database['public']['Tables']['agent_commissions']['Insert'];

export default function Commissions() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCommission, setEditingCommission] = useState<AgentCommission | null>(null);
  const [formData, setFormData] = useState<Partial<AgentCommissionInsert>>({});

  const { data: commissions = [], isLoading } = useQuery({
    queryKey: ['agent_commissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agent_commissions').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: agencyLoads = [] } = useQuery({
    queryKey: ['agency_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agency_loads').select('*');
      if (error) throw error;
      return data;
    },
  });

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

  const openDialog = (commission?: AgentCommission) => {
    setEditingCommission(commission || null);
    setFormData(commission || { status: 'pending', commission_rate: 0, commission_amount: 0 });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingCommission(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agent_name) {
      toast.error('Agent name is required');
      return;
    }
    if (editingCommission) {
      updateMutation.mutate({ id: editingCommission.id, ...formData });
    } else {
      createMutation.mutate(formData as AgentCommissionInsert);
    }
  };

  const getLoadRef = (loadId: string | null) => {
    if (!loadId) return '-';
    const load = agencyLoads.find(l => l.id === loadId);
    return load?.load_reference || '-';
  };

  const columns = [
    { key: 'agent_name', header: 'Agent' },
    { key: 'load_id', header: 'Load Ref', render: (c: AgentCommission) => getLoadRef(c.load_id) },
    { key: 'commission_rate', header: 'Rate', render: (c: AgentCommission) => `${c.commission_rate}%` },
    { key: 'commission_amount', header: 'Amount', render: (c: AgentCommission) => `$${c.commission_amount.toFixed(2)}` },
    { key: 'payout_date', header: 'Payout Date', render: (c: AgentCommission) => c.payout_date || '-' },
    { key: 'status', header: 'Status', render: (c: AgentCommission) => <StatusBadge status={c.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (commission: AgentCommission) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(commission); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(commission.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Agent Commissions" description="Track agent commissions from agency loads" action={{ label: 'Add Commission', onClick: () => openDialog() }} />
      <DataTable columns={columns} data={commissions} loading={isLoading} emptyMessage="No commissions yet" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCommission ? 'Edit Commission' : 'Add Commission'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent_name">Agent Name *</Label>
              <Input id="agent_name" value={formData.agent_name || ''} onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="load_id">Related Load</Label>
              <Select value={formData.load_id || 'none'} onValueChange={(v) => setFormData({ ...formData, load_id: v === 'none' ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Select load (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agencyLoads.map(l => <SelectItem key={l.id} value={l.id}>{l.load_reference || `${l.origin} → ${l.destination}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="commission_rate">Rate (%)</Label>
                <Input id="commission_rate" type="number" step="0.01" value={formData.commission_rate || ''} onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commission_amount">Amount ($)</Label>
                <Input id="commission_amount" type="number" step="0.01" value={formData.commission_amount || ''} onChange={(e) => setFormData({ ...formData, commission_amount: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payout_date">Payout Date</Label>
                <Input id="payout_date" type="date" value={formData.payout_date || ''} onChange={(e) => setFormData({ ...formData, payout_date: e.target.value })} />
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
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingCommission ? 'Save Changes' : 'Add Commission'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
