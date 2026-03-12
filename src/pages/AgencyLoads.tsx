import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Trash2, MoreHorizontal, Briefcase } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Database } from '@/integrations/supabase/types';

type AgencyLoad = Database['public']['Tables']['agency_loads']['Row'];
type AgencyLoadInsert = Database['public']['Tables']['agency_loads']['Insert'];

export default function AgencyLoads() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<AgencyLoad | null>(null);
  const [formData, setFormData] = useState<Partial<AgencyLoadInsert>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['agency_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agency_loads').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (load: AgencyLoadInsert) => {
      const { error } = await supabase.from('agency_loads').insert(load);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
      toast.success('Load created successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgencyLoad> & { id: string }) => {
      const { error } = await supabase.from('agency_loads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
      toast.success('Load updated successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agency_loads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
      toast.success('Load deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (load?: AgencyLoad) => {
    setEditingLoad(load || null);
    setFormData(load || { status: 'pending' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingLoad(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.origin || !formData.destination) {
      toast.error('Origin and destination are required');
      return;
    }
    if (editingLoad) {
      updateMutation.mutate({ id: editingLoad.id, ...formData });
    } else {
      createMutation.mutate(formData as AgencyLoadInsert);
    }
  };

  const columns = [
    { key: 'load_reference', header: 'Reference', render: (l: AgencyLoad) => l.load_reference || '-' },
    { key: 'broker_name', header: 'Broker' },
    { key: 'carrier_name', header: 'Carrier', hiddenOnMobile: true },
    { key: 'origin', header: 'Origin' },
    { key: 'destination', header: 'Destination' },
    { key: 'broker_rate', header: 'Broker Rate', hiddenOnMobile: true, render: (l: AgencyLoad) => `$${l.broker_rate?.toFixed(2) || '0.00'}` },
    { key: 'carrier_rate', header: 'Carrier Rate', hiddenOnMobile: true, render: (l: AgencyLoad) => `$${l.carrier_rate?.toFixed(2) || '0.00'}` },
    { key: 'margin', header: 'Margin', render: (l: AgencyLoad) => <span className={Number(l.margin) >= 0 ? 'text-success' : 'text-destructive'}>${l.margin?.toFixed(2) || '0.00'}</span> },
    { key: 'status', header: 'Status', render: (l: AgencyLoad) => <StatusBadge status={l.status} /> },
    {
      key: 'actions',
      header: '',
      render: (load: AgencyLoad) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openDialog(load)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(load.id)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Agency Loads" description="Manage brokerage and agency loads" action={{ label: 'Add Load', onClick: () => openDialog() }} />
      <DataTable
        columns={columns}
        data={loads}
        loading={isLoading}
        emptyMessage="No agency loads yet"
        emptyDescription="Add your first brokerage load to start tracking margins."
        emptyIcon={Briefcase}
        emptyAction={{ label: 'Add First Load', onClick: () => openDialog() }}
        tableId="agency-loads"
        exportFilename="agency-loads"
        onRowDoubleClick={(load) => openDialog(load)}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(ids) => (
          <>
            <Button size="sm" variant="outline" onClick={() => setMassEditOpen(true)}>
              <Pencil className="mr-1 h-3 w-3" /> Edit ({ids.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setMassDeleteOpen(true)}>
              <Trash2 className="mr-1 h-3 w-3" /> Delete ({ids.size})
            </Button>
          </>
        )}
      />
      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={async () => {
          setBulkUpdating(true);
          try {
            const { error } = await supabase.from('agency_loads').delete().in('id', [...selectedIds]);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
            toast.success(`${selectedIds.size} load(s) deleted`);
            setSelectedIds(new Set());
            setMassDeleteOpen(false);
          } catch (e: any) { toast.error(e.message); }
          finally { setBulkUpdating(false); }
        }}
        title="Delete Selected Loads"
        description={`Are you sure you want to delete ${selectedIds.size} load(s)? This action cannot be undone.`}
        isDeleting={bulkUpdating}
      />
      <BulkStatusEditDialog
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        onConfirm={async (status) => {
          setBulkUpdating(true);
          try {
            const { error } = await supabase.from('agency_loads').update({ status }).in('id', [...selectedIds]);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
            toast.success(`${selectedIds.size} load(s) updated`);
            setSelectedIds(new Set());
            setMassEditOpen(false);
          } catch (e: any) { toast.error(e.message); }
          finally { setBulkUpdating(false); }
        }}
        count={selectedIds.size}
        entityName="loads"
        isUpdating={bulkUpdating}
        statusOptions={[
          { value: 'pending', label: 'Pending' },
          { value: 'booked', label: 'Booked' },
          { value: 'in_transit', label: 'In Transit' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLoad ? 'Edit Agency Load' : 'Add New Agency Load'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="load_reference">Load Reference</Label>
                <Input id="load_reference" value={formData.load_reference || ''} onChange={(e) => setFormData({ ...formData, load_reference: e.target.value })} placeholder="REF-12345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'pending'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="broker_name">Broker Name</Label>
                <Input id="broker_name" value={formData.broker_name || ''} onChange={(e) => setFormData({ ...formData, broker_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier_name">Carrier Name</Label>
                <Input id="carrier_name" value={formData.carrier_name || ''} onChange={(e) => setFormData({ ...formData, carrier_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Origin *</Label>
                <Input id="origin" value={formData.origin || ''} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="City, State" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input id="destination" value={formData.destination || ''} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="City, State" required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pickup_date">Pickup Date</Label>
                <Input id="pickup_date" type="date" value={formData.pickup_date || ''} onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_date">Delivery Date</Label>
                <Input id="delivery_date" type="date" value={formData.delivery_date || ''} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="broker_rate">Broker Rate ($)</Label>
                <Input id="broker_rate" type="number" step="0.01" value={formData.broker_rate || ''} onChange={(e) => setFormData({ ...formData, broker_rate: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier_rate">Carrier Rate ($)</Label>
                <Input id="carrier_rate" type="number" step="0.01" value={formData.carrier_rate || ''} onChange={(e) => setFormData({ ...formData, carrier_rate: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <LoadingButton type="submit" className="gradient-gold text-primary-foreground" loading={createMutation.isPending || updateMutation.isPending}>
                {editingLoad ? 'Save Changes' : 'Add Load'}
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
