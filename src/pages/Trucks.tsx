import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DocumentUpload } from '@/components/shared/DocumentUpload';
import { ExpensesList } from '@/components/shared/ExpensesList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Pencil, Trash2, FileText, DollarSign, User, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { addDays, differenceInDays, format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';

type Truck = Database['public']['Tables']['trucks']['Row'];
type TruckInsert = Database['public']['Tables']['trucks']['Insert'];

type DriverSummary = {
  id: string;
  first_name: string;
  last_name: string;
};

type TruckWithDriver = Truck & { drivers?: DriverSummary | null };

const toEditableTruck = (truck?: TruckWithDriver | null): Partial<TruckInsert> => {
  if (!truck) return { status: 'active' };

  // IMPORTANT: strip out any joined/derived fields (e.g. `drivers`) so updates don't
  // attempt to write non-existent columns.
  const {
    unit_number,
    status,
    make,
    model,
    year,
    vin,
    license_plate,
    license_plate_state,
    next_inspection_date,
    current_driver_id,
  } = truck;

  return {
    unit_number: unit_number ?? undefined,
    status: status ?? 'active',
    make: make ?? null,
    model: model ?? null,
    year: year ?? null,
    vin: vin ?? null,
    license_plate: license_plate ?? null,
    license_plate_state: license_plate_state ?? null,
    next_inspection_date: next_inspection_date ?? null,
    current_driver_id: current_driver_id ?? null,
  };
};

export default function Trucks() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<TruckWithDriver | null>(null);
  const [formData, setFormData] = useState<Partial<TruckInsert>>({});

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('*, drivers!trucks_current_driver_id_fkey(id, first_name, last_name)')
        .order('unit_number');
      if (error) throw error;
      return (data ?? []) as TruckWithDriver[];
    },
  });

  // Fetch service schedules for 120-Day Inspections
  const { data: serviceSchedules = [] } = useQuery({
    queryKey: ['service-schedules-120day'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_schedules')
        .select('*')
        .eq('service_name', '120-Day Inspection');
      if (error) throw error;
      return data;
    },
  });

  // Create a map of truck ID to inspection status
  const inspectionStatusMap = useMemo(() => {
    const today = new Date();
    const map = new Map<string, { nextInspectionDate: string | null; daysRemaining: number | null; status: 'ok' | 'warning' | 'overdue' | 'never' }>();
    
    serviceSchedules.forEach(schedule => {
      if (!schedule.last_performed_date) {
        map.set(schedule.truck_id, {
          nextInspectionDate: null,
          daysRemaining: null,
          status: 'never',
        });
      } else {
        const lastDate = new Date(schedule.last_performed_date);
        const dueDate = addDays(lastDate, schedule.interval_days || 120);
        const daysRemaining = differenceInDays(dueDate, today);
        
        let status: 'ok' | 'warning' | 'overdue' = 'ok';
        if (daysRemaining < 0) {
          status = 'overdue';
        } else if (daysRemaining <= 30) {
          status = 'warning';
        }
        
        map.set(schedule.truck_id, {
          nextInspectionDate: format(dueDate, 'yyyy-MM-dd'),
          daysRemaining,
          status,
        });
      }
    });
    
    return map;
  }, [serviceSchedules]);

  // Fetch drivers for assignment
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status')
        .eq('status', 'active')
        .order('first_name');
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

  const openDialog = (truck?: TruckWithDriver) => {
    setEditingTruck(truck || null);
    setFormData(toEditableTruck(truck));
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
    { 
      key: 'current_driver', 
      header: 'Current Driver',
      render: (truck: any) => {
        const driver = truck.drivers;
        return driver ? `${driver.first_name} ${driver.last_name}` : <span className="text-muted-foreground">Unassigned</span>;
      }
    },
    { key: 'status', header: 'Status', render: (truck: TruckWithDriver) => <StatusBadge status={truck.status} /> },
    { 
      key: 'next_120_inspection', 
      header: '120-Day Inspection',
      render: (truck: TruckWithDriver) => {
        const inspection = inspectionStatusMap.get(truck.id);
        if (!inspection) {
          return <span className="text-muted-foreground">-</span>;
        }
        
        if (inspection.status === 'never') {
          return (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Never Inspected</span>
            </div>
          );
        }
        
        const statusConfig = {
          ok: { color: 'text-green-600', icon: CheckCircle },
          warning: { color: 'text-yellow-600', icon: AlertTriangle },
          overdue: { color: 'text-red-600', icon: AlertTriangle },
        };
        
        const config = statusConfig[inspection.status];
        const Icon = config.icon;
        
        return (
          <div className={`flex items-center gap-1 ${config.color}`}>
            <Icon className="h-4 w-4" />
            <span className="text-xs">
              {inspection.daysRemaining !== null && inspection.daysRemaining < 0 
                ? `Overdue ${Math.abs(inspection.daysRemaining)}d`
                : `${inspection.daysRemaining}d left`}
            </span>
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (truck: TruckWithDriver) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewingTruck(truck); }} title="View details">
            <FileText className="h-4 w-4" />
          </Button>
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

  const [viewingTruck, setViewingTruck] = useState<TruckWithDriver | null>(null);

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
            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <Input id="vin" value={formData.vin || ''} onChange={(e) => setFormData({ ...formData, vin: e.target.value })} placeholder="1FUJGBDV7CLBP8834" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="license_plate">License Plate</Label>
                <Input id="license_plate" value={formData.license_plate || ''} onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })} placeholder="ABC-1234" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_plate_state">License Plate State</Label>
                <Select value={(formData as any).license_plate_state || ''} onValueChange={(v) => setFormData({ ...formData, license_plate_state: v } as any)}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_inspection_date">Next Inspection Date</Label>
              <Input id="next_inspection_date" type="date" value={formData.next_inspection_date || ''} onChange={(e) => setFormData({ ...formData, next_inspection_date: e.target.value })} />
            </div>

            <div className="border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="current_driver_id" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Current Driver
                </Label>
                <Select 
                  value={formData.current_driver_id || 'none'} 
                  onValueChange={(v) => setFormData({ ...formData, current_driver_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No driver assigned</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.first_name} {driver.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Assign a driver to this truck to enable their DVIR and maintenance features.
                </p>
              </div>
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

      {/* Truck Details Dialog with Documents & Expenses */}
      <Dialog open={!!viewingTruck} onOpenChange={(open) => !open && setViewingTruck(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Truck {viewingTruck?.unit_number} - {viewingTruck?.make} {viewingTruck?.model}</DialogTitle>
          </DialogHeader>
          {viewingTruck && (
            <Tabs defaultValue="expenses" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="expenses" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Expenses
                </TabsTrigger>
                <TabsTrigger value="documents" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documents
                </TabsTrigger>
              </TabsList>
              <TabsContent value="expenses" className="mt-4">
                <ExpensesList
                  relatedType="truck"
                  relatedId={viewingTruck.id}
                  title="Truck Expenses"
                />
              </TabsContent>
              <TabsContent value="documents" className="mt-4">
                <DocumentUpload
                  relatedType="truck"
                  relatedId={viewingTruck.id}
                  documentTypes={['Registration', 'Insurance', 'Inspection', 'Title', 'Other']}
                  title="Truck Documents"
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
