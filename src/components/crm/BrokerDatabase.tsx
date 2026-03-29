import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { Search, Building2, Plus, Trash2, Edit2, Eye, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';

interface BrokerContact {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  agent_code: string | null; // MC Number
  notes: string | null;
  tags: string[] | null; // [credit_score, avg_days_to_pay]
  is_active: boolean;
  city: string | null;
  state: string | null;
}

export function BrokerDatabase() {
  const { orgId, isOwner, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = isOwner || hasRole('dispatcher');

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editBroker, setEditBroker] = useState<BrokerContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrokerContact | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    mc_number: '',
    credit_score: '',
    avg_days_to_pay: '',
    city: '',
    state: '',
    notes: '',
  });

  const { data: brokers = [], isLoading } = useQuery({
    queryKey: ['crm-brokers', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('contact_type', 'broker')
        .order('company_name');
      if (error) throw error;
      return data as BrokerContact[];
    },
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (broker: any) => {
      const { error } = await supabase.from('crm_contacts').insert({
        ...broker,
        contact_type: 'broker',
        org_id: orgId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-brokers'] });
      toast.success('Broker added');
      closeForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase.from('crm_contacts').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-brokers'] });
      toast.success('Broker updated');
      closeForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-brokers'] });
      toast.success('Broker deleted');
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return brokers;
    const q = search.toLowerCase();
    return brokers.filter(
      (b) =>
        b.company_name.toLowerCase().includes(q) ||
        (b.contact_name && b.contact_name.toLowerCase().includes(q)) ||
        (b.agent_code && b.agent_code.toLowerCase().includes(q)) ||
        (b.email && b.email.toLowerCase().includes(q))
    );
  }, [brokers, search]);

  const openForm = (broker?: BrokerContact) => {
    if (broker) {
      setEditBroker(broker);
      setFormData({
        company_name: broker.company_name,
        contact_name: broker.contact_name || '',
        email: broker.email || '',
        phone: broker.phone || '',
        mc_number: broker.agent_code || '',
        credit_score: broker.tags?.[0] || '',
        avg_days_to_pay: broker.tags?.[1] || '',
        city: broker.city || '',
        state: broker.state || '',
        notes: broker.notes || '',
      });
    } else {
      setEditBroker(null);
      setFormData({ company_name: '', contact_name: '', email: '', phone: '', mc_number: '', credit_score: '', avg_days_to_pay: '', city: '', state: '', notes: '' });
    }
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditBroker(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name.trim()) {
      toast.error('Broker name is required');
      return;
    }

    const tags: string[] = [];
    if (formData.credit_score) tags.push(formData.credit_score);
    if (formData.avg_days_to_pay) tags.push(formData.avg_days_to_pay);

    const payload = {
      company_name: formData.company_name,
      contact_name: formData.contact_name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      agent_code: formData.mc_number || null,
      city: formData.city || null,
      state: formData.state || null,
      notes: formData.notes || null,
      tags: tags.length > 0 ? tags : null,
    };

    if (editBroker) {
      updateMutation.mutate({ id: editBroker.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const getCreditBadge = (tags: string[] | null) => {
    if (!tags?.[0]) return null;
    const score = parseInt(tags[0]);
    if (isNaN(score)) return <Badge variant="secondary">{tags[0]}</Badge>;
    if (score >= 80) return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Score: {score}</Badge>;
    if (score >= 60) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Score: {score}</Badge>;
    return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Score: {score}</Badge>;
  };

  return (
    <>
      <PageHeader
        title="Broker CRM"
        description="Manage your broker relationships, credit scores, and payment terms"
        action={canEdit ? { label: 'Add Broker', onClick: () => openForm() } : undefined}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Brokers</p>
          <p className="text-2xl font-bold">{brokers.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-2xl font-bold">{brokers.filter(b => b.is_active).length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">With MC#</p>
          <p className="text-2xl font-bold">{brokers.filter(b => b.agent_code).length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Avg Days to Pay</p>
          <p className="text-2xl font-bold">
            {brokers.filter(b => b.tags?.[1]).length > 0
              ? Math.round(brokers.filter(b => b.tags?.[1]).reduce((sum, b) => sum + parseInt(b.tags![1]) || 0, 0) / brokers.filter(b => b.tags?.[1]).length)
              : '—'}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search brokers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <DataTable
          columns={[
            {
              key: 'company_name', header: 'Broker Name', render: (b: BrokerContact) => (
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {b.company_name}
                  </div>
                  {b.contact_name && <span className="text-xs text-muted-foreground">{b.contact_name}</span>}
                </div>
              ),
            },
            { key: 'mc_number', header: 'MC#', hiddenOnMobile: true, render: (b: BrokerContact) => b.agent_code ? <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{b.agent_code}</code> : '—' },
            { key: 'credit', header: 'Credit Score', hiddenOnMobile: true, render: (b: BrokerContact) => getCreditBadge(b.tags) || '—' },
            { key: 'days_to_pay', header: 'Avg Days to Pay', hiddenOnMobile: true, render: (b: BrokerContact) => b.tags?.[1] ? `${b.tags[1]} days` : '—' },
            { key: 'contact', header: 'Contact', hiddenOnMobile: true, render: (b: BrokerContact) => (
              <div className="text-sm">
                {b.email && <div>{b.email}</div>}
                {b.phone && <div className="text-muted-foreground">{b.phone}</div>}
              </div>
            )},
            {
              key: 'actions', header: '', render: (b: BrokerContact) => canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openForm(b)}>
                      <Edit2 className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(b)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null,
            },
          ]}
          data={filtered}
          loading={isLoading}
          emptyMessage="No brokers yet. Add your first broker to get started."
          tableId="broker-database"
          exportFilename="brokers"
        />
      </div>

      {/* Broker Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editBroker ? 'Edit Broker' : 'Add Broker'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Broker Name *</Label>
                <Input value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>MC Number</Label>
                <Input value={formData.mc_number} onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })} placeholder="MC-123456" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Credit Score (0-100)</Label>
                <Input type="number" min="0" max="100" value={formData.credit_score} onChange={(e) => setFormData({ ...formData, credit_score: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Avg Days to Pay</Label>
                <Input type="number" min="0" value={formData.avg_days_to_pay} onChange={(e) => setFormData({ ...formData, avg_days_to_pay: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editBroker ? 'Save Changes' : 'Add Broker'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Broker"
        description={`Are you sure you want to delete "${deleteTarget?.company_name}"? This action cannot be undone.`}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
