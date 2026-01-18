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
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type MaintenanceLog = Database['public']['Tables']['maintenance_logs']['Row'];
type MaintenanceLogInsert = Database['public']['Tables']['maintenance_logs']['Insert'];

const serviceTypes = ['Oil Change', 'Tire Replacement', 'Brake Service', 'Engine Repair', 'Transmission', 'Electrical', 'DOT Inspection', 'General Maintenance', 'Other'];

export default function Maintenance() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);
  const [formData, setFormData] = useState<Partial<MaintenanceLogInsert>>({});

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['maintenance_logs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('maintenance_logs').select('*').order('service_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (log: MaintenanceLogInsert) => {
      const { error } = await supabase.from('maintenance_logs').insert(log);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance_logs'] });
      toast.success('Maintenance log added');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MaintenanceLog> & { id: string }) => {
      const { error } = await supabase.from('maintenance_logs').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance_logs'] });
      toast.success('Maintenance log updated');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance_logs'] });
      toast.success('Maintenance log deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (log?: MaintenanceLog) => {
    setEditingLog(log || null);
    setFormData(log || { service_type: 'General Maintenance' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingLog(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.truck_id || !formData.service_type) {
      toast.error('Truck and service type are required');
      return;
    }
    if (editingLog) {
      updateMutation.mutate({ id: editingLog.id, ...formData });
    } else {
      createMutation.mutate(formData as MaintenanceLogInsert);
    }
  };

  const getTruckUnit = (truckId: string) => {
    const truck = trucks.find(t => t.id === truckId);
    return truck?.unit_number || '-';
  };

  const columns = [
    { key: 'truck_id', header: 'Truck', render: (l: MaintenanceLog) => getTruckUnit(l.truck_id) },
    { key: 'service_type', header: 'Service Type' },
    { key: 'service_date', header: 'Service Date' },
    { key: 'vendor', header: 'Vendor', render: (l: MaintenanceLog) => l.vendor || '-' },
    { key: 'cost', header: 'Cost', render: (l: MaintenanceLog) => `$${(l.cost || 0).toFixed(2)}` },
    { key: 'next_service_date', header: 'Next Service', render: (l: MaintenanceLog) => l.next_service_date || '-' },
    {
      key: 'actions',
      header: 'Actions',
      render: (log: MaintenanceLog) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(log); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(log.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Maintenance" description="Track truck maintenance and repairs" action={{ label: 'Add Record', onClick: () => openDialog() }} />
      <DataTable columns={columns} data={logs} loading={isLoading} emptyMessage="No maintenance records yet" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLog ? 'Edit Maintenance' : 'Add Maintenance Record'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="truck_id">Truck *</Label>
                <Select value={formData.truck_id || ''} onValueChange={(v) => setFormData({ ...formData, truck_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                  <SelectContent>
                    {trucks.map(t => <SelectItem key={t.id} value={t.id}>{t.unit_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="service_type">Service Type *</Label>
                <Select value={formData.service_type || ''} onValueChange={(v) => setFormData({ ...formData, service_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="service_date">Service Date</Label>
                <Input id="service_date" type="date" value={formData.service_date || ''} onChange={(e) => setFormData({ ...formData, service_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next_service_date">Next Service Date</Label>
                <Input id="next_service_date" type="date" value={formData.next_service_date || ''} onChange={(e) => setFormData({ ...formData, next_service_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor</Label>
                <Input id="vendor" value={formData.vendor || ''} onChange={(e) => setFormData({ ...formData, vendor: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost ($)</Label>
                <Input id="cost" type="number" step="0.01" value={formData.cost || ''} onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingLog ? 'Save Changes' : 'Add Record'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
