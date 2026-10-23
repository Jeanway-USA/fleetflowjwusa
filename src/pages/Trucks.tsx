import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useHighlightRow } from '@/hooks/useHighlightRow';


import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Roster, RosterToolbar, RosterBulkBar, downloadCsv, type RosterEntry, type RosterFact, type FactTone } from '@/components/fleet/Roster';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DocumentUpload } from '@/components/shared/DocumentUpload';
import { ExpensesList } from '@/components/shared/ExpensesList';
import { LoadingButton } from '@/components/shared/LoadingButton';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { toast } from 'sonner';
import { Pencil, FileText, DollarSign, User, Truck as TruckIcon, MoreHorizontal, FileSpreadsheet, Landmark, Archive, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency } from '@/lib/formatters';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { CSVImportDialog } from '@/components/shared/CSVImportDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { addDays, addMonths, differenceInDays, format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { TruckLoanPaymentsSection } from '@/components/trucks/TruckLoanPaymentsSection';
import { AmortizationCard } from '@/components/trucks/AmortizationCard';
import { DriverAssignmentSelect } from '@/components/trucks/DriverAssignmentSelect';


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
    purchase_mileage,
    loan_balance,
    monthly_payment,
    interest_rate,
    loan_term_months,
    loan_start_date,
    lender_name,
  } = truck;
  const original_loan_amount = (truck as any).original_loan_amount as number | null | undefined;

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
    purchase_mileage: purchase_mileage ?? null,
    loan_balance: loan_balance ?? null,
    original_loan_amount: original_loan_amount ?? null,
    monthly_payment: monthly_payment ?? null,
    interest_rate: interest_rate ?? null,
    loan_term_months: loan_term_months ?? null,
    loan_start_date: loan_start_date ?? null,
    lender_name: lender_name ?? null,
  } as Partial<TruckInsert>;
};


export default function Trucks() {
  const highlightId = useHighlightRow();

  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<TruckWithDriver | null>(null);
  const [formData, setFormData] = useState<Partial<TruckInsert>>({});
  
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');


  const truckFields = [
    { key: 'unit_number', label: 'Unit Number', required: true },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
    { key: 'year', label: 'Year' },
    { key: 'vin', label: 'VIN' },
    { key: 'license_plate', label: 'License Plate' },
    { key: 'license_plate_state', label: 'License Plate State' },
    { key: 'status', label: 'Status' },
    { key: 'purchase_mileage', label: 'Purchase Mileage' },
  ];

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('*, drivers!trucks_current_driver_id_fkey(id, first_name, last_name)')
        .is('deleted_at', null);
      if (error) throw error;
      const rows = (data ?? []) as TruckWithDriver[];
      // Natural sort by unit_number so "T-101" and "433780" order sensibly.
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      return [...rows].sort((a, b) => collator.compare(a.unit_number ?? '', b.unit_number ?? ''));
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
        const lastDate = new Date(schedule.last_performed_date + 'T00:00:00');
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

  // Archive with undo — uses soft-delete RPC
  const deleteWithUndo = async (truck: TruckWithDriver) => {
    const { archiveWithUndo } = await import('@/lib/soft-delete');
    await archiveWithUndo({
      table: 'trucks',
      id: truck.id,
      itemName: truck.unit_number,
      queryClient,
      invalidateKeys: [['trucks']],
    });
  };


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


  const loanText = (truck: TruckWithDriver): { text: string; tone?: FactTone } => {
    const rawBalance = truck.loan_balance;
    const original = Number((truck as any).original_loan_amount ?? 0);
    const balance = Number(rawBalance ?? 0);
    // Only "Paid off" when the balance was recorded and reached zero.
    if (rawBalance != null && balance <= 0 && original > 0) return { text: 'Paid off', tone: 'good' };
    if (rawBalance == null && original > 0) return { text: `${formatCurrency(original, { maximumFractionDigits: 0 })} remaining` };
    if (balance <= 0) return { text: 'No loan' };
    return { text: `${formatCurrency(balance, { maximumFractionDigits: 0 })} remaining` };
  };

  const inspectionFact = (truck: TruckWithDriver): RosterFact | null => {
    const inspection = inspectionStatusMap.get(truck.id);
    if (!inspection) return null;
    const label = '120-day inspection';
    if (inspection.status === 'never') return { label, value: 'Never inspected', tone: 'warn' };
    const days = inspection.daysRemaining ?? 0;
    if (days < 0) return { label, value: `Overdue ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}`, tone: 'bad' };
    return { label, value: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, tone: days <= 30 ? 'warn' : undefined };
  };

  const [viewingTruckState, setViewingTruck] = useState<TruckWithDriver | null>(null);
  // Keep the viewed truck fresh from the ['trucks'] query so mutations (e.g. loan payments) reflect immediately.
  const viewingTruck = viewingTruckState
    ? ((trucks as TruckWithDriver[]).find((t) => t.id === viewingTruckState.id) ?? viewingTruckState)
    : null;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const handleBulkDelete = async () => {
    setBulkUpdating(true);
    try {
      const { archiveManyWithUndo } = await import('@/lib/soft-delete');
      await archiveManyWithUndo({
        table: 'trucks',
        ids: [...selectedIds],
        queryClient,
        invalidateKeys: [['trucks']],
      });
      setSelectedIds(new Set());
      setMassDeleteOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkUpdating(false); }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    setBulkUpdating(true);
    try {
      const { error } = await supabase.from('trucks').update({ status }).in('id', [...selectedIds]);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      toast.success(`${selectedIds.size} truck(s) updated`);
      setSelectedIds(new Set());
      setMassEditOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkUpdating(false); }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allTrucks = trucks as TruckWithDriver[];
  const filteredTrucks = allTrucks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const driver = t.drivers ? `${t.drivers.first_name} ${t.drivers.last_name}` : '';
    return [t.unit_number, t.make, t.model, t.year, t.vin, t.license_plate, driver].filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  const inService = allTrucks.filter((t) => t.status === 'active').length;
  const loanTotal = allTrucks.reduce((sum, t) => sum + (t.loan_balance != null ? Number(t.loan_balance) : Number((t as any).original_loan_amount ?? 0)), 0);
  const inspectionsDue = allTrucks.filter((t) => {
    const i = inspectionStatusMap.get(t.id);
    return !!i && (i.status === 'never' || i.status === 'overdue' || i.status === 'warning');
  }).length;

  const entries: RosterEntry[] = filteredTrucks.map((truck) => {
    const loan = loanText(truck);
    const inspection = inspectionFact(truck);
    const description = [truck.year, truck.make, truck.model].filter(Boolean).join(' ');
    return {
      id: truck.id,
      title: `Unit ${truck.unit_number}`,
      onOpen: () => setViewingTruck(truck),
      chips: <StatusBadge status={truck.status} />,
      subtitle: [description, truck.license_plate ? `Plate ${truck.license_plate}${truck.license_plate_state ? ` (${truck.license_plate_state})` : ''}` : null].filter(Boolean).join(', ') || undefined,
      facts: [
        { label: 'Driver', value: truck.drivers ? `${truck.drivers.first_name} ${truck.drivers.last_name}` : <span className="font-normal text-muted-foreground">Unassigned</span> },
        { label: truck.lender_name ? `Loan, ${truck.lender_name}` : 'Loan', value: loan.text, tone: loan.tone },
        ...(inspection ? [inspection] : []),
      ],
      menu: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for unit ${truck.unit_number}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewingTruck(truck)}><FileText className="mr-2 h-4 w-4" /> View details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openDialog(truck)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => deleteWithUndo(truck)}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };
  });

  const exportCsv = () =>
    downloadCsv(
      'trucks',
      ['Unit', 'Year', 'Make', 'Model', 'Driver', 'Status', 'Lender', 'Loan balance', 'Plate'],
      filteredTrucks.map((t) => [t.unit_number, t.year, t.make, t.model, t.drivers ? `${t.drivers.first_name} ${t.drivers.last_name}` : '', t.status, t.lender_name, t.loan_balance, t.license_plate]),
    );

  return (
    <>
      <PageHeader title="Trucks" description="Manage your fleet vehicles" action={{ label: 'Add Truck', onClick: () => openDialog() }}>
        <Button variant="outline" className="h-11 sm:h-10" onClick={() => setCsvImportOpen(true)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Import CSV
        </Button>
      </PageHeader>
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : (trucks as TruckWithDriver[]).length === 0 ? (
        <EmptyState
          icon={TruckIcon}
          title="No trucks registered yet"
          description="Add your first truck to start managing your fleet."
          action={{ label: 'Add First Truck', onClick: () => openDialog() }}
        />
      ) : (
        <>
          <Panel title="Your trucks" className="mb-5">
            <StatementLine label="Trucks in service" note={`${(trucks as TruckWithDriver[]).length} on file`} value={inService} />
            <StatementLine label="Loan balance remaining" note="Across every truck with a loan" value={formatCurrency(loanTotal, { maximumFractionDigits: 0 })} rule="single" />
            <StatementLine
              label="Inspections due within 30 days"
              note={inspectionsDue === 0 ? 'Nothing due or overdue.' : 'Includes overdue and never-inspected trucks.'}
              value={inspectionsDue}
              rule="single"
              tone={inspectionsDue > 0 ? 'bad' : undefined}
            />
          </Panel>

          <RosterToolbar search={search} onSearch={setSearch} placeholder="Search by unit, make, model, VIN, plate, driver">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="down">Down</SelectItem>
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

          <Roster entries={entries} selectedIds={selectedIds} onToggle={toggleSelect} empty="No trucks match your filters." />
        </>
      )}
      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={handleBulkDelete}
        title="Archive Selected Trucks"
        description={`Archive ${selectedIds.size} truck(s)? They can be restored from the Archive page.`}
        isDeleting={bulkUpdating}
      />
      <BulkStatusEditDialog
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        onConfirm={handleBulkStatusUpdate}
        count={selectedIds.size}
        entityName="trucks"
        isUpdating={bulkUpdating}
        statusOptions={[
          { value: 'active', label: 'Active' },
          { value: 'down', label: 'Down' },
          { value: 'out_of_service', label: 'Out of Service' },
        ]}
      />

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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="next_inspection_date">Next Inspection Date</Label>
                <Input id="next_inspection_date" type="date" value={formData.next_inspection_date || ''} onChange={(e) => setFormData({ ...formData, next_inspection_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase_mileage">Purchase Mileage</Label>
                <Input 
                  id="purchase_mileage" 
                  type="number" 
                  value={(formData as any).purchase_mileage || ''} 
                  onChange={(e) => setFormData({ ...formData, purchase_mileage: e.target.value ? parseInt(e.target.value) : null } as any)} 
                  placeholder="e.g. 50000"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="current_driver_id" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Current Driver
                </Label>
                <DriverAssignmentSelect
                  value={formData.current_driver_id ?? null}
                  onChange={(id) => setFormData({ ...formData, current_driver_id: id })}
                />

              </div>
            </div>


            {/* Financing Section */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full border-t pt-4 text-sm font-medium hover:text-primary transition-colors">
                <Landmark className="h-4 w-4" />
                Loan & Financing
                <span className="text-xs text-muted-foreground ml-auto">Click to expand</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lender_name">Lender Name</Label>
                    <Input id="lender_name" value={(formData as any).lender_name || ''} onChange={(e) => setFormData({ ...formData, lender_name: e.target.value || null } as any)} placeholder="e.g. Daimler Truck Financial" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="original_loan_amount">Original Loan Amount ($)</Label>
                    <Input id="original_loan_amount" type="number" step="0.01" value={(formData as any).original_loan_amount || ''} onChange={(e) => setFormData({ ...formData, original_loan_amount: e.target.value ? parseFloat(e.target.value) : null } as any)} placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loan_balance">Remaining Loan Balance ($)</Label>
                    <Input id="loan_balance" type="number" step="0.01" value={(formData as any).loan_balance || ''} onChange={(e) => setFormData({ ...formData, loan_balance: e.target.value ? parseFloat(e.target.value) : null } as any)} placeholder="0.00" />
                    <p className="text-xs text-muted-foreground">Use "Log Loan Payment" in the truck details view to decrement this over time.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthly_payment">Monthly Payment ($)</Label>
                    <Input id="monthly_payment" type="number" step="0.01" value={(formData as any).monthly_payment || ''} onChange={(e) => setFormData({ ...formData, monthly_payment: e.target.value ? parseFloat(e.target.value) : null } as any)} placeholder="0.00" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="down_payment">Down Payment ($)</Label>
                    <Input id="down_payment" type="number" step="0.01" value={(formData as any).down_payment || ''} onChange={(e) => setFormData({ ...formData, down_payment: e.target.value ? parseFloat(e.target.value) : null } as any)} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="financing_fees">Financing / UCC Fees ($)</Label>
                    <Input id="financing_fees" type="number" step="0.01" value={(formData as any).financing_fees || ''} onChange={(e) => setFormData({ ...formData, financing_fees: e.target.value ? parseFloat(e.target.value) : null } as any)} placeholder="0.00" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="interest_rate">Interest Rate (%)</Label>
                    <Input id="interest_rate" type="number" step="0.01" value={(formData as any).interest_rate || ''} onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value ? parseFloat(e.target.value) : null } as any)} placeholder="0.00" />
                  </div>
                  <div />
                </div>


                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loan_term_months">Loan Term (months)</Label>
                    <Input id="loan_term_months" type="number" value={(formData as any).loan_term_months || ''} onChange={(e) => setFormData({ ...formData, loan_term_months: e.target.value ? parseInt(e.target.value) : null } as any)} placeholder="e.g. 60" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loan_start_date">Loan Start Date</Label>
                    <Input id="loan_start_date" type="date" value={(formData as any).loan_start_date || ''} onChange={(e) => setFormData({ ...formData, loan_start_date: e.target.value || null } as any)} />
                  </div>
                </div>
                {(formData as any).loan_start_date && (formData as any).loan_term_months && (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Estimated Payoff Date:</span>{' '}
                      {format(addMonths(new Date((formData as any).loan_start_date + 'T00:00:00'), (formData as any).loan_term_months), 'MM/dd/yyyy')}
                    </p>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={createMutation.isPending || updateMutation.isPending}>
                Cancel
              </Button>
              <LoadingButton 
                type="submit" 
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                loading={createMutation.isPending || updateMutation.isPending}
                loadingText={editingTruck ? 'Saving...' : 'Adding...'}
              >
                {editingTruck ? 'Save Changes' : 'Add Truck'}
              </LoadingButton>
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
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview" className="flex items-center gap-2">
                  <TruckIcon className="h-4 w-4" /> Overview
                </TabsTrigger>
                <TabsTrigger value="expenses" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Expenses
                </TabsTrigger>
                <TabsTrigger value="documents" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documents
                </TabsTrigger>
                <TabsTrigger value="financing" className="flex items-center gap-2">
                  <Landmark className="h-4 w-4" /> Financing
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-4">
                {(() => {
                  const loan = loanText(viewingTruck);
                  const inspection = inspectionFact(viewingTruck);
                  const small = (text: React.ReactNode) => <span className="text-base font-medium">{text}</span>;
                  return (
                    <div className="divide-y">
                      <StatementLine label="Driver" value={small(viewingTruck.drivers ? `${viewingTruck.drivers.first_name} ${viewingTruck.drivers.last_name}` : 'Unassigned')} />
                      <StatementLine label="Status" value={<StatusBadge status={viewingTruck.status} />} />
                      <StatementLine label="VIN" value={small(<span className="font-mono text-sm">{viewingTruck.vin || 'Not set'}</span>)} />
                      <StatementLine label="License plate" value={small(viewingTruck.license_plate ? `${viewingTruck.license_plate}${viewingTruck.license_plate_state ? ` (${viewingTruck.license_plate_state})` : ''}` : 'Not set')} />
                      <StatementLine label="Mileage when bought" value={small(viewingTruck.purchase_mileage != null ? Number(viewingTruck.purchase_mileage).toLocaleString() : 'Not set')} />
                      {inspection && <StatementLine label="120-day inspection" value={small(inspection.value)} tone={inspection.tone === 'bad' ? 'bad' : undefined} />}
                      <StatementLine label="Loan" note={viewingTruck.lender_name ?? undefined} value={small(loan.text)} tone={loan.tone === 'good' ? 'good' : undefined} />
                      {viewingTruck.monthly_payment ? <StatementLine label="Monthly payment" value={formatCurrency(Number(viewingTruck.monthly_payment))} /> : null}
                    </div>
                  );
                })()}
              </TabsContent>
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
              <TabsContent value="financing" className="mt-4 space-y-4">
                <AmortizationCard truck={viewingTruck as any} />
                <TruckLoanPaymentsSection
                  truckId={viewingTruck.id}
                  loanBalance={viewingTruck.loan_balance ?? null}
                  originalLoanAmount={(viewingTruck as any).original_loan_amount ?? null}
                />
                {viewingTruck.monthly_payment ? (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="text-sm">
                      <p className="font-medium">Loan payments post automatically</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(Number(viewingTruck.monthly_payment))} is added to the loan ledger and Finance on each due date. Use Catch Up to post anything due that's missing.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const { data, error } = await (supabase as any).rpc('post_due_truck_loan_payments', {
                          p_truck_id: viewingTruck.id,
                        });
                        if (error) {
                          toast.error(error.message);
                          return;
                        }
                        const posted = Array.isArray(data) ? data.length : 0;
                        toast.success(posted === 0 ? 'All due payments are already posted' : `Posted ${posted} payment${posted === 1 ? '' : 's'}`);
                        queryClient.invalidateQueries({ queryKey: ['trucks'] });
                        queryClient.invalidateQueries({ queryKey: ['truck_loan_payments', viewingTruck.id] });
                        queryClient.invalidateQueries({ queryKey: ['truck_loan_payments_sum', viewingTruck.id] });
                      }}
                    >
                      Catch Up
                    </Button>
                  </div>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Landmark className="h-4 w-4" /> Loan Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {viewingTruck.lender_name || viewingTruck.loan_balance || (viewingTruck as any).original_loan_amount ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Lender</p>
                          <p className="font-medium">{viewingTruck.lender_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Monthly Payment</p>
                          <p className="font-medium">{viewingTruck.monthly_payment ? formatCurrency(viewingTruck.monthly_payment) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Interest Rate</p>
                          <p className="font-medium">{viewingTruck.interest_rate != null ? `${viewingTruck.interest_rate}%` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Loan Term</p>
                          <p className="font-medium">{viewingTruck.loan_term_months ? `${viewingTruck.loan_term_months} months` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Loan Start Date</p>
                          <p className="font-medium">{viewingTruck.loan_start_date ? format(new Date(viewingTruck.loan_start_date + 'T00:00:00'), 'MM/dd/yyyy') : '—'}</p>
                        </div>
                        {viewingTruck.loan_start_date && viewingTruck.loan_term_months && (
                          <div className="col-span-2 rounded-md bg-muted p-3 mt-2">
                            <p className="text-sm">
                              <span className="font-medium">Estimated Payoff Date:</span>{' '}
                              {format(addMonths(new Date(viewingTruck.loan_start_date + 'T00:00:00'), viewingTruck.loan_term_months), 'MM/dd/yyyy')}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No financing information on file for this truck.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <CSVImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        tableName="trucks"
        fields={truckFields}
        queryKey={['trucks']}
        title="Import Trucks from CSV"
      />
    </>
  );
}
