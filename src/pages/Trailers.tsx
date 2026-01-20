import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DocumentUpload } from '@/components/shared/DocumentUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Pencil, Trash2, FileText, User, AlertTriangle, CheckCircle, Clock, History } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { TrailerAssignmentHistory } from '@/components/trailers/TrailerAssignmentHistory';

const TRAILER_TYPES = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Lowboy', 'Tanker', 'Hopper', 'Other'] as const;

interface Trailer {
  id: string;
  unit_number: string;
  trailer_type: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  license_plate: string | null;
  license_plate_state: string | null;
  status: string;
  current_driver_id: string | null;
  last_inspection_date: string | null;
  next_inspection_date: string | null;
  owned_or_leased: string | null;
  monthly_payment: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TrailerInsert {
  unit_number: string;
  trailer_type?: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  vin?: string | null;
  license_plate?: string | null;
  license_plate_state?: string | null;
  status?: string;
  current_driver_id?: string | null;
  last_inspection_date?: string | null;
  next_inspection_date?: string | null;
  owned_or_leased?: string | null;
  monthly_payment?: number | null;
  notes?: string | null;
}

type DriverSummary = {
  id: string;
  first_name: string;
  last_name: string;
};

type TrailerWithDriver = Trailer & { drivers?: DriverSummary | null };

const toEditableTrailer = (trailer?: TrailerWithDriver | null): Partial<TrailerInsert> => {
  if (!trailer) return { status: 'active', trailer_type: 'Dry Van', owned_or_leased: 'owned' };

  return {
    unit_number: trailer.unit_number,
    trailer_type: trailer.trailer_type || 'Dry Van',
    status: trailer.status || 'active',
    make: trailer.make,
    model: trailer.model,
    year: trailer.year,
    vin: trailer.vin,
    license_plate: trailer.license_plate,
    license_plate_state: trailer.license_plate_state,
    next_inspection_date: trailer.next_inspection_date,
    current_driver_id: trailer.current_driver_id,
    owned_or_leased: trailer.owned_or_leased || 'owned',
    monthly_payment: trailer.monthly_payment,
    notes: trailer.notes,
  };
};

export default function Trailers() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrailer, setEditingTrailer] = useState<TrailerWithDriver | null>(null);
  const [formData, setFormData] = useState<Partial<TrailerInsert>>({});
  const [viewingTrailer, setViewingTrailer] = useState<TrailerWithDriver | null>(null);

  const { data: trailers = [], isLoading } = useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trailers')
        .select('*')
        .order('unit_number');
      if (error) throw error;
      return (data ?? []) as TrailerWithDriver[];
    },
  });

  // Fetch drivers for assignment
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-for-trailer-assignment'],
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

  // Compute inspection status for each trailer
  const inspectionStatusMap = useMemo(() => {
    const today = new Date();
    const map = new Map<string, { daysRemaining: number | null; status: 'ok' | 'warning' | 'overdue' | 'never' }>();
    
    trailers.forEach(trailer => {
      if (!trailer.next_inspection_date) {
        map.set(trailer.id, { daysRemaining: null, status: 'never' });
      } else {
        const dueDate = new Date(trailer.next_inspection_date + 'T00:00:00');
        const daysRemaining = differenceInDays(dueDate, today);
        
        let status: 'ok' | 'warning' | 'overdue' = 'ok';
        if (daysRemaining < 0) {
          status = 'overdue';
        } else if (daysRemaining <= 30) {
          status = 'warning';
        }
        
        map.set(trailer.id, { daysRemaining, status });
      }
    });
    
    return map;
  }, [trailers]);

  const createMutation = useMutation({
    mutationFn: async (trailer: TrailerInsert) => {
      const { error } = await supabase.from('trailers').insert(trailer);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      toast.success('Trailer added successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Trailer> & { id: string }) => {
      const { error } = await supabase.from('trailers').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      toast.success('Trailer updated successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trailers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      toast.success('Trailer deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (trailer?: TrailerWithDriver) => {
    setEditingTrailer(trailer || null);
    setFormData(toEditableTrailer(trailer));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTrailer(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.unit_number) {
      toast.error('Unit number is required');
      return;
    }
    if (editingTrailer) {
      updateMutation.mutate({ id: editingTrailer.id, ...formData });
    } else {
      createMutation.mutate(formData as TrailerInsert);
    }
  };

  const columns = [
    { key: 'unit_number', header: 'Unit #' },
    { key: 'trailer_type', header: 'Type' },
    { key: 'make', header: 'Make' },
    { key: 'year', header: 'Year' },
    { key: 'status', header: 'Status', render: (trailer: TrailerWithDriver) => <StatusBadge status={trailer.status} /> },
    { 
      key: 'next_inspection', 
      header: 'Annual Inspection',
      render: (trailer: TrailerWithDriver) => {
        const inspection = inspectionStatusMap.get(trailer.id);
        if (!inspection) {
          return <span className="text-muted-foreground">-</span>;
        }
        
        if (inspection.status === 'never') {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-muted-foreground cursor-help">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs">Not Set</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>No inspection date set</p>
              </TooltipContent>
            </Tooltip>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1 ${config.color} cursor-help`}>
                <Icon className="h-4 w-4" />
                <span className="text-xs">
                  {inspection.daysRemaining !== null && inspection.daysRemaining < 0 
                    ? `Overdue ${Math.abs(inspection.daysRemaining)}d`
                    : `${inspection.daysRemaining}d left`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Due: {trailer.next_inspection_date}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (trailer: TrailerWithDriver) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewingTrailer(trailer); }} title="View details">
            <FileText className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(trailer); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(trailer.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Trailers" description="Manage your fleet trailers" action={{ label: 'Add Trailer', onClick: () => openDialog() }} />
      <DataTable columns={columns} data={trailers} loading={isLoading} emptyMessage="No trailers registered yet" />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTrailer ? 'Edit Trailer' : 'Add New Trailer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_number">Unit Number *</Label>
                <Input id="unit_number" value={formData.unit_number || ''} onChange={(e) => setFormData({ ...formData, unit_number: e.target.value })} placeholder="TRL-001" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trailer_type">Trailer Type</Label>
                <Select value={formData.trailer_type || 'Dry Van'} onValueChange={(v) => setFormData({ ...formData, trailer_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAILER_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'active'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="in_shop">In Shop</SelectItem>
                    <SelectItem value="out_of_service">Out of Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="owned_or_leased">Ownership</Label>
                <Select value={formData.owned_or_leased || 'owned'} onValueChange={(v) => setFormData({ ...formData, owned_or_leased: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Owned</SelectItem>
                    <SelectItem value="leased">Leased</SelectItem>
                    <SelectItem value="rented">Rented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input id="make" value={formData.make || ''} onChange={(e) => setFormData({ ...formData, make: e.target.value })} placeholder="Great Dane" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={formData.model || ''} onChange={(e) => setFormData({ ...formData, model: e.target.value })} placeholder="Champion" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input id="year" type="number" value={formData.year || ''} onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || undefined })} placeholder="2023" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <Input id="vin" value={formData.vin || ''} onChange={(e) => setFormData({ ...formData, vin: e.target.value })} placeholder="1GRAA0628DB123456" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="license_plate">License Plate</Label>
                <Input id="license_plate" value={formData.license_plate || ''} onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })} placeholder="ABC-1234" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_plate_state">Plate State</Label>
                <Select value={formData.license_plate_state || ''} onValueChange={(v) => setFormData({ ...formData, license_plate_state: v })}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="next_inspection_date">Next Inspection Date</Label>
                <Input id="next_inspection_date" type="date" value={formData.next_inspection_date || ''} onChange={(e) => setFormData({ ...formData, next_inspection_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_payment">Monthly Payment</Label>
                <Input id="monthly_payment" type="number" step="0.01" value={formData.monthly_payment || ''} onChange={(e) => setFormData({ ...formData, monthly_payment: parseFloat(e.target.value) || undefined })} placeholder="0.00" />
              </div>
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
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingTrailer ? 'Save Changes' : 'Add Trailer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Trailer Details Dialog */}
      <Dialog open={!!viewingTrailer} onOpenChange={(open) => !open && setViewingTrailer(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trailer {viewingTrailer?.unit_number} - {viewingTrailer?.trailer_type}</DialogTitle>
          </DialogHeader>
          {viewingTrailer && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Details
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <History className="h-4 w-4" /> Assignment History
                </TabsTrigger>
                <TabsTrigger value="documents" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documents
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Make/Model:</span>
                    <p className="font-medium">{viewingTrailer.make || '-'} {viewingTrailer.model || ''}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Year:</span>
                    <p className="font-medium">{viewingTrailer.year || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">VIN:</span>
                    <p className="font-medium font-mono text-xs">{viewingTrailer.vin || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">License Plate:</span>
                    <p className="font-medium">{viewingTrailer.license_plate || '-'} {viewingTrailer.license_plate_state || ''}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ownership:</span>
                    <p className="font-medium capitalize">{viewingTrailer.owned_or_leased || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Monthly Payment:</span>
                    <p className="font-medium">{viewingTrailer.monthly_payment ? `$${viewingTrailer.monthly_payment.toFixed(2)}` : '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Next Inspection:</span>
                    <p className="font-medium">{viewingTrailer.next_inspection_date || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <StatusBadge status={viewingTrailer.status} />
                  </div>
                </div>
                {viewingTrailer.notes && (
                  <div>
                    <span className="text-muted-foreground text-sm">Notes:</span>
                    <p className="text-sm mt-1">{viewingTrailer.notes}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="pt-4">
                <TrailerAssignmentHistory trailerId={viewingTrailer.id} />
              </TabsContent>

              <TabsContent value="documents" className="pt-4">
                <DocumentUpload relatedType="trailer" relatedId={viewingTrailer.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
