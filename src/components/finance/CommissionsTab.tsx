import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';
import { archiveWithUndo } from '@/lib/soft-delete';

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
      await archiveWithUndo({
        table: 'agent_commissions',
        id,
        queryClient,
        invalidateKeys: [['agent_commissions']],
      });
    },
    onSuccess: () => {
      /* archiveWithUndo handles toast + invalidation */
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

  const rows = filteredCommissions;
  const menu = (commission: AgentCommission) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for ${commission.agent_name}`}>
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
  );

  return (
    <>
      <Panel
        title="Agent commissions"
        description="What you earn as the agency. Commissions count as revenue on the Profit & loss tab."
        flush
        aside={
          <Button className="h-11 gap-2" onClick={() => openDialog()}>
            <Plus className="h-4 w-4" /> Add commission
          </Button>
        }
      >
        <div className="px-4">
          <StatementLine
            label="Commissions this period"
            note={`${commissionTotals.count} ${commissionTotals.count === 1 ? 'commission' : 'commissions'}`}
            value={formatCurrency(commissionTotals.amount)}
          />
        </div>

        {commissionsLoading ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">Loading commissions.</p>
        ) : rows.length === 0 ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">No commissions for this period. Use Add commission when you earn one.</p>
        ) : (
          <>
            {/* Phone: one card per commission */}
            <ul className="divide-y border-t md:hidden">
              {rows.map((c) => (
                <li key={c.id} className="flex items-start gap-1 py-1 pl-4 pr-1">
                  <div className="min-w-0 flex-1 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{c.agent_name}</span>
                      <span className="figure text-base font-semibold">{formatCurrency(c.commission_amount)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-foreground">
                      <StatusBadge status={c.status} />
                      <span>{c.commission_rate}%{c.payout_date ? `, payout ${c.payout_date}` : ''}</span>
                    </div>
                  </div>
                  {menu(c)}
                </li>
              ))}
            </ul>

            {/* Desktop: the table */}
            <div className="hidden overflow-x-auto border-t md:block">
              <table className="w-full text-[15px]">
                <caption className="sr-only">Agent commissions for the selected period</caption>
                <thead>
                  <tr className="border-b text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-4 py-2">Agent</th>
                    <th scope="col" className="py-2 text-right">Rate</th>
                    <th scope="col" className="py-2 text-right">Amount</th>
                    <th scope="col" className="py-2 pl-6">Payout date</th>
                    <th scope="col" className="py-2">Status</th>
                    <th scope="col" className="w-12 py-2 pr-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium">{c.agent_name}</td>
                      <td className="figure py-2 text-right">{c.commission_rate}%</td>
                      <td className="figure py-2 text-right font-semibold">{formatCurrency(c.commission_amount)}</td>
                      <td className="py-2 pl-6 tabular-nums">{c.payout_date || ''}</td>
                      <td className="py-2"><StatusBadge status={c.status} /></td>
                      <td className="py-1 pr-2">{menu(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

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
              <LoadingButton type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" loading={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Save Changes' : 'Add Commission'}
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
