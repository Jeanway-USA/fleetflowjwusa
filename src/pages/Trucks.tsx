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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Truck = Database['public']['Tables']['trucks']['Row'];
type TruckInsert = Database['public']['Tables']['trucks']['Insert'];

export default function Trucks() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [formData, setFormData] = useState<Partial<TruckInsert>>({});

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*').order('unit_number');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (truck: TruckInsert) => {
      const { error } = await supabase.from('trucks').insert(truck);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      toast.success('Truck added successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Truck> & { id: string }) => {
      const { error } = await supabase.from('trucks').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      toast.success('Truck updated successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trucks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      toast.success('Truck deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (truck?: Truck) => {
    setEditingTruck(truck || null);
    setFormData(truck || { status: 'active' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTruck(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.unit_number) {
      toast.error('Unit number is required');
      return;
    }
    if (editingTruck) {
      updateMutation.mutate({ id: editingTruck.id, ...formData });
    } else {
      createMutation.mutate(formData as TruckInsert);
    }
  };

  const columns = [
    { key: 'unit_number', header: 'Unit #' },
    { key: 'make', header: 'Make' },
    { key: 'model', header: 'Model' },
    { key: 'year', header: 'Year' },
    { key: 'vin', header: 'VIN' },
    { key: 'status', header: 'Status', render: (truck: Truck) => <StatusBadge status={truck.status} /> },
    { 
      key: 'next_inspection_date', 
      header: 'Next Inspection',
      render: (truck: Truck) => truck.next_inspection_date || '-'
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (truck: Truck) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(truck); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(truck.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Trucks" description="Manage your fleet vehicles" action={{ label: 'Add Truck', onClick: () => openDialog() }} />
      <DataTable columns={columns} data={trucks} loading={isLoading} emptyMessage="No trucks registered yet" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTruck ? 'Edit Truck' : 'Add New Truck'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_number">Unit Number *</Label>
                <Input id="unit_number" value={formData.unit_number || ''} onChange={(e) => setFormData({ ...formData, unit_number: e.target.value })} placeholder="T001" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'active'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="down">Down</SelectItem>
                    <SelectItem value="out_of_service">Out of Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input id="make" value={formData.make || ''} onChange={(e) => setFormData({ ...formData, make: e.target.value })} placeholder="Freightliner" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={formData.model || ''} onChange={(e) => setFormData({ ...formData, model: e.target.value })} placeholder="Cascadia" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input id="year" type="number" value={formData.year || ''} onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || undefined })} placeholder="2023" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vin">VIN</Label>
                <Input id="vin" value={formData.vin || ''} onChange={(e) => setFormData({ ...formData, vin: e.target.value })} placeholder="1FUJGBDV7CLBP8834" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_plate">License Plate</Label>
                <Input id="license_plate" value={formData.license_plate || ''} onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })} placeholder="ABC-1234" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_inspection_date">Next Inspection Date</Label>
              <Input id="next_inspection_date" type="date" value={formData.next_inspection_date || ''} onChange={(e) => setFormData({ ...formData, next_inspection_date: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingTruck ? 'Save Changes' : 'Add Truck'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
