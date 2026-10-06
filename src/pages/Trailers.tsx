import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useHighlightRow } from '@/hooks/useHighlightRow';


import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Roster, RosterToolbar, RosterBulkBar, downloadCsv, type RosterEntry, type RosterFact } from '@/components/fleet/Roster';
import { formatCurrency } from '@/lib/formatters';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DocumentUpload } from '@/components/shared/DocumentUpload';
import { LoadingButton } from '@/components/shared/LoadingButton';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { toast } from 'sonner';
import { Pencil, FileText, User, History, Container, MoreHorizontal, Archive, Download } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  const highlightId = useHighlightRow();

  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrailer, setEditingTrailer] = useState<TrailerWithDriver | null>(null);
  const [formData, setFormData] = useState<Partial<TrailerInsert>>({});
  const [viewingTrailer, setViewingTrailer] = useState<TrailerWithDriver | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: trailers = [], isLoading } = useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trailers')
        .select('*')
        .is('deleted_at', null)
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
        .from('drivers_public_view')
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

  const deleteWithUndo = async (trailer: TrailerWithDriver) => {
    const { archiveWithUndo } = await import('@/lib/soft-delete');
    await archiveWithUndo({
      table: 'trailers',
      id: trailer.id,
      itemName: trailer.unit_number,
      queryClient,
      invalidateKeys: [['trailers']],
    });
  };

  const openDialog = (trailer?: TrailerWithDriver) => {
    setEditingTrailer(trailer || null);
    setFormData(toEditableTrailer(trailer));
    setDialogOpen(true);
  };

  const handleBulkDelete = async () => {
    setBulkUpdating(true);
    try {
      const { archiveManyWithUndo } = await import('@/lib/soft-delete');
      await archiveManyWithUndo({
        table: 'trailers',
        ids: [...selectedIds],
        queryClient,
        invalidateKeys: [['trailers']],
      });
      setSelectedIds(new Set());
      setMassDeleteOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkUpdating(false); }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    setBulkUpdating(true);
    try {
      const { error } = await supabase.from('trailers').update({ status }).in('id', [...selectedIds]);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      toast.success(`${selectedIds.size} trailer(s) updated`);
      setSelectedIds(new Set());
      setMassEditOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkUpdating(false); }
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

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const driverName = (id: string | null) => {
    const d = (drivers as any[]).find((x) => x.id === id);
    return d ? `${d.first_name} ${d.last_name}` : null;
  };

  const filteredTrailers = trailers.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.unit_number, t.trailer_type, t.make, t.model, t.year, t.vin, t.license_plate, driverName(t.current_driver_id)].filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  const inService = trailers.filter((t) => t.status === 'active').length;
  const inspectionsDue = trailers.filter((t) => {
    const i = inspectionStatusMap.get(t.id);
    return !!i && i.status !== 'ok' && i.status !== 'never';
  }).length;
  const leasedMonthly = trailers.reduce((sum, t) => sum + (t.owned_or_leased === 'leased' ? Number(t.monthly_payment ?? 0) : 0), 0);

  const entries: RosterEntry[] = filteredTrailers.map((trailer) => {
    const inspection = inspectionStatusMap.get(trailer.id);
    let inspectionFact: RosterFact;
    if (!inspection || inspection.status === 'never') {
      inspectionFact = { label: 'Annual inspection', value: <span className="font-normal text-muted-foreground">No date set</span> };
    } else {
      const days = inspection.daysRemaining ?? 0;
      inspectionFact = days < 0
        ? { label: 'Annual inspection', value: `Overdue ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}`, tone: 'bad' }
        : { label: 'Annual inspection', value: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, tone: days <= 30 ? 'warn' : undefined };
    }
    const leased = trailer.owned_or_leased === 'leased';
    const assigned = driverName(trailer.current_driver_id);
    return {
      id: trailer.id,
      title: `Unit ${trailer.unit_number}`,
      onOpen: () => setViewingTrailer(trailer),
      chips: <StatusBadge status={trailer.status} />,
      subtitle: [trailer.trailer_type, [trailer.year, trailer.make, trailer.model].filter(Boolean).join(' '), trailer.license_plate ? `Plate ${trailer.license_plate}${trailer.license_plate_state ? ` (${trailer.license_plate_state})` : ''}` : null].filter(Boolean).join(', ') || undefined,
      facts: [
        { label: 'Driver', value: assigned ?? <span className="font-normal text-muted-foreground">Unassigned</span> },
        { label: 'Ownership', value: leased ? `Leased${trailer.monthly_payment ? `, ${formatCurrency(Number(trailer.monthly_payment))} a month` : ''}` : 'Owned' },
        inspectionFact,
      ],
      menu: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for unit ${trailer.unit_number}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewingTrailer(trailer)}><FileText className="mr-2 h-4 w-4" /> View details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openDialog(trailer)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => deleteWithUndo(trailer)}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };
  });

  const exportCsv = () =>
    downloadCsv(
      'trailers',
      ['Unit', 'Type', 'Year', 'Make', 'Model', 'Driver', 'Status', 'Ownership', 'Monthly payment', 'Plate'],
      filteredTrailers.map((t) => [t.unit_number, t.trailer_type, t.year, t.make, t.model, driverName(t.current_driver_id), t.status, t.owned_or_leased, t.monthly_payment, t.license_plate]),
    );

  return (
    <>
      <PageHeader title="Trailers" description="Manage your fleet trailers" action={{ label: 'Add Trailer', onClick: () => openDialog() }} />
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : trailers.length === 0 ? (
        <EmptyState
          icon={Container}
          title="No trailers registered yet"
          description="Add your first trailer to manage your trailer fleet."
          action={{ label: 'Add First Trailer', onClick: () => openDialog() }}
        />
      ) : (
        <>
          <Panel title="Your trailers" className="mb-5">
            <StatementLine label="Trailers in service" note={`${trailers.length} on file`} value={inService} />
            <StatementLine
              label="Inspections due within 30 days"
              note={inspectionsDue === 0 ? 'Nothing due or overdue.' : 'Includes overdue trailers.'}
              value={inspectionsDue}
              rule="single"
              tone={inspectionsDue > 0 ? 'bad' : undefined}
            />
            {leasedMonthly > 0 && <StatementLine label="Leased trailers cost" note="Monthly, across leased trailers" value={formatCurrency(leasedMonthly)} rule="single" />}
          </Panel>

          <RosterToolbar search={search} onSearch={setSearch} placeholder="Search by unit, type, make, VIN, plate, driver">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="in_shop">In shop</SelectItem>
                <SelectItem value="out_of_service">Out of service</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-11" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </RosterToolbar>

          <RosterBulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
            <Button variant="outline" className="h-11" onClick={() => setMassEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Change status
            </Button>
            <Button variant="outline" className="h-11 text-destructive" onClick={() => setMassDeleteOpen(true)}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </Button>
          </RosterBulkBar>

          <Roster entries={entries} selectedIds={selectedIds} onToggle={toggleSelect} empty="No trailers match your filters." />
        </>
      )}
      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={handleBulkDelete}
        title="Archive Selected Trailers"
        description={`Archive ${selectedIds.size} trailer(s)? They can be restored from the Archive page.`}
        isDeleting={bulkUpdating}
      />
      <BulkStatusEditDialog
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        onConfirm={handleBulkStatusUpdate}
        count={selectedIds.size}
        entityName="trailers"
        isUpdating={bulkUpdating}
        statusOptions={[
          { value: 'active', label: 'Active' },
          { value: 'in_shop', label: 'In Shop' },
          { value: 'out_of_service', label: 'Out of Service' },
        ]}
      />

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
              <Button type="button" variant="outline" onClick={closeDialog} disabled={createMutation.isPending || updateMutation.isPending}>
                Cancel
              </Button>
              <LoadingButton 
                type="submit" 
                className="gradient-gold text-primary-foreground"
                loading={createMutation.isPending || updateMutation.isPending}
                loadingText={editingTrailer ? 'Saving...' : 'Adding...'}
              >
                {editingTrailer ? 'Save Changes' : 'Add Trailer'}
              </LoadingButton>
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
                <div className="divide-y">
                  <StatementLine label="Make and model" value={<span className="text-base font-medium">{[viewingTrailer.make, viewingTrailer.model].filter(Boolean).join(' ') || 'Not set'}</span>} />
                  <StatementLine label="Year" value={<span className="text-base font-medium">{viewingTrailer.year || 'Not set'}</span>} />
                  <StatementLine label="VIN" value={<span className="font-mono text-sm font-medium">{viewingTrailer.vin || 'Not set'}</span>} />
                  <StatementLine label="License plate" value={<span className="text-base font-medium">{viewingTrailer.license_plate ? `${viewingTrailer.license_plate}${viewingTrailer.license_plate_state ? ` (${viewingTrailer.license_plate_state})` : ''}` : 'Not set'}</span>} />
                  <StatementLine label="Ownership" value={<span className="text-base font-medium capitalize">{viewingTrailer.owned_or_leased || 'Not set'}</span>} />
                  {viewingTrailer.monthly_payment ? <StatementLine label="Monthly payment" value={formatCurrency(Number(viewingTrailer.monthly_payment))} /> : null}
                  <StatementLine label="Next inspection" value={<span className="text-base font-medium">{viewingTrailer.next_inspection_date || 'Not set'}</span>} />
                  <StatementLine label="Status" value={<StatusBadge status={viewingTrailer.status} />} />
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
    </>
  );
}
