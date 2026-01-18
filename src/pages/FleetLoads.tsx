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

type FleetLoad = Database['public']['Tables']['fleet_loads']['Row'];
type FleetLoadInsert = Database['public']['Tables']['fleet_loads']['Insert'];
type Driver = Database['public']['Tables']['drivers']['Row'];
type Truck = Database['public']['Tables']['trucks']['Row'];

export default function FleetLoads() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<FleetLoad | null>(null);
  const [formData, setFormData] = useState<Partial<FleetLoadInsert>>({});

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').eq('status', 'active');
      if (error) throw error;
      return data;
    },
  });

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*').eq('status', 'active');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (load: FleetLoadInsert) => {
      const { error } = await supabase.from('fleet_loads').insert(load);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      toast.success('Load created successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FleetLoad> & { id: string }) => {
      const { error } = await supabase.from('fleet_loads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      toast.success('Load updated successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fleet_loads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      toast.success('Load deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (load?: FleetLoad) => {
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
      createMutation.mutate(formData as FleetLoadInsert);
    }
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '-';
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : '-';
  };

  const getTruckUnit = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find(t => t.id === truckId);
    return truck?.unit_number || '-';
  };

  const columns = [
    { key: 'landstar_load_id', header: 'Landstar ID', render: (l: FleetLoad) => l.landstar_load_id || '-' },
    { key: 'origin', header: 'Origin' },
    { key: 'destination', header: 'Destination' },
    { key: 'pickup_date', header: 'Pickup', render: (l: FleetLoad) => l.pickup_date || '-' },
    { key: 'delivery_date', header: 'Delivery', render: (l: FleetLoad) => l.delivery_date || '-' },
    { key: 'driver_id', header: 'Driver', render: (l: FleetLoad) => getDriverName(l.driver_id) },
    { key: 'truck_id', header: 'Truck', render: (l: FleetLoad) => getTruckUnit(l.truck_id) },
    { key: 'rate', header: 'Rate', render: (l: FleetLoad) => `$${l.rate?.toFixed(2) || '0.00'}` },
    { key: 'status', header: 'Status', render: (l: FleetLoad) => <StatusBadge status={l.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (load: FleetLoad) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(load); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(load.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Fleet Loads" description="Manage your fleet loads with Landstar integration" action={{ label: 'Add Load', onClick: () => openDialog() }} />
      <DataTable columns={columns} data={loads} loading={isLoading} emptyMessage="No loads yet" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLoad ? 'Edit Load' : 'Add New Load'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="landstar_load_id">Landstar Load ID</Label>
                <Input id="landstar_load_id" value={formData.landstar_load_id || ''} onChange={(e) => setFormData({ ...formData, landstar_load_id: e.target.value })} placeholder="LS-12345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'pending'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Origin *</Label>
                <Input id="origin" value={formData.origin || ''} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="City, State" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input id="destination" value={formData.destination || ''} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="City, State" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pickup_date">Pickup Date</Label>
                <Input id="pickup_date" type="date" value={formData.pickup_date || ''} onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_date">Delivery Date</Label>
                <Input id="delivery_date" type="date" value={formData.delivery_date || ''} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver_id">Driver</Label>
                <Select value={formData.driver_id || ''} onValueChange={(v) => setFormData({ ...formData, driver_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="truck_id">Truck</Label>
                <Select value={formData.truck_id || ''} onValueChange={(v) => setFormData({ ...formData, truck_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {trucks.map(t => <SelectItem key={t.id} value={t.id}>{t.unit_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rate">Rate ($)</Label>
                <Input id="rate" type="number" step="0.01" value={formData.rate || ''} onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuel_advance">Fuel Advance ($)</Label>
                <Input id="fuel_advance" type="number" step="0.01" value={formData.fuel_advance || ''} onChange={(e) => setFormData({ ...formData, fuel_advance: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="detention_pay">Detention ($)</Label>
                <Input id="detention_pay" type="number" step="0.01" value={formData.detention_pay || ''} onChange={(e) => setFormData({ ...formData, detention_pay: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingLoad ? 'Save Changes' : 'Add Load'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
