import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Roster, RosterToolbar, RosterBulkBar, downloadCsv, type RosterEntry } from '@/components/fleet/Roster';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Eye, Pencil, Trash2, FileWarning, Car, Users, Camera, MoreHorizontal, Archive, Download } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface Incident {
  id: string;
  incident_date: string;
  incident_type: string;
  severity: string;
  driver_id: string | null;
  truck_id: string | null;
  trailer_id: string | null;
  location_description: string | null;
  description: string;
  police_report_number: string | null;
  citation_issued: boolean;
  injuries_reported: boolean;
  injury_details: string | null;
  estimated_damage: number;
  insurance_claim_number: string | null;
  status: string;
  resolution_notes: string | null;
  created_at: string;
}

const incidentTypes = [
  { value: 'accident', label: 'Accident' },
  { value: 'near_miss', label: 'Near Miss' },
  { value: 'cargo_damage', label: 'Cargo Damage' },
  { value: 'injury', label: 'Injury' },
  { value: 'theft', label: 'Theft' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'other', label: 'Other' },
];

const severityLevels = [
  { value: 'minor', label: 'Minor', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'moderate', label: 'Moderate', color: 'bg-orange-100 text-orange-800' },
  { value: 'major', label: 'Major', color: 'bg-red-100 text-red-800' },
  { value: 'critical', label: 'Critical', color: 'bg-red-500 text-white' },
];

const statusOptions = [
  { value: 'reported', label: 'Reported' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function Incidents() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewingIncident, setViewingIncident] = useState<Incident | null>(null);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);
  const [formData, setFormData] = useState<Partial<Incident>>({
    incident_type: 'accident',
    severity: 'minor',
    status: 'reported',
    citation_issued: false,
    injuries_reported: false,
    estimated_damage: 0,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .is('deleted_at', null)
        .order('incident_date', { ascending: false });
      if (error) throw error;
      return data as Incident[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers_public_view').select('id, first_name, last_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('id, unit_number').is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  const { data: trailers = [] } = useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trailers').select('id, unit_number').is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (incident: Partial<Incident>) => {
      const payload: Record<string, unknown> = { ...incident };
      // Convert empty/undefined nullable fields to null for Supabase
      if (!payload.driver_id) payload.driver_id = null;
      if (!payload.truck_id) payload.truck_id = null;
      if (!payload.trailer_id) payload.trailer_id = null;
      const { error } = await supabase.from('incidents').insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Incident reported');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Incident> & { id: string }) => {
      const { error } = await supabase.from('incidents').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Incident updated');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { archiveWithUndo } = await import('@/lib/soft-delete');
      await archiveWithUndo({
        table: 'incidents',
        id,
        queryClient,
        invalidateKeys: [['incidents']],
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (incident?: Incident) => {
    setEditingIncident(incident || null);
    setFormData(incident || {
      incident_type: 'accident',
      severity: 'minor',
      status: 'reported',
      citation_issued: false,
      injuries_reported: false,
      estimated_damage: 0,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingIncident(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description) {
      toast.error('Description is required');
      return;
    }
    if (editingIncident) {
      updateMutation.mutate({ id: editingIncident.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '-';
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : '-';
  };

  const getTruckName = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find(t => t.id === truckId);
    return truck ? `#${truck.unit_number}` : '-';
  };

  const getSeverityBadge = (severity: string) => {
    const level = severityLevels.find(l => l.value === severity);
    return (
      <Badge className={level?.color || 'bg-muted'}>
        {level?.label || severity}
      </Badge>
    );
  };

  const formatCurrencyValue = (value: number | null) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  // Stats
  const stats = {
    total: incidents.length,
    open: incidents.filter(i => i.status === 'reported' || i.status === 'under_review').length,
    critical: incidents.filter(i => i.severity === 'critical' || i.severity === 'major').length,
    withInjuries: incidents.filter(i => i.injuries_reported).length,
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const typeLabel = (i: Incident) => incidentTypes.find((t) => t.value === i.incident_type)?.label ?? i.incident_type.replace('_', ' ');
  const filteredIncidents = incidents.filter((i) => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [typeLabel(i), getDriverName(i.driver_id), getTruckName(i.truck_id), i.location_description, i.description].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  const entries: RosterEntry[] = filteredIncidents.map((incident) => ({
    id: incident.id,
    title: typeLabel(incident),
    onOpen: () => setViewingIncident(incident),
    chips: (
      <>
        {getSeverityBadge(incident.severity)}
        <StatusBadge status={incident.status} />
      </>
    ),
    subtitle: [format(parseISO(incident.incident_date), 'MMM d, yyyy'), incident.location_description].filter(Boolean).join(', '),
    facts: [
      { label: 'Driver', value: getDriverName(incident.driver_id) },
      { label: 'Truck', value: getTruckName(incident.truck_id) },
      { label: 'Damage estimate', value: formatCurrencyValue(incident.estimated_damage) },
      ...(incident.injuries_reported ? [{ label: 'Injuries', value: 'Reported', tone: 'bad' as const }] : []),
    ],
    menu: (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for ${typeLabel(incident)} on ${format(parseISO(incident.incident_date), 'MMM d')}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setViewingIncident(incident)}><Eye className="mr-2 h-4 w-4" /> View details</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog(incident)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(incident.id)}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  }));

  const exportCsv = () =>
    downloadCsv(
      'incidents',
      ['Date', 'Type', 'Severity', 'Driver', 'Truck', 'Location', 'Damage estimate', 'Status'],
      filteredIncidents.map((i) => [i.incident_date, typeLabel(i), i.severity, getDriverName(i.driver_id), getTruckName(i.truck_id), i.location_description, i.estimated_damage, i.status]),
    );

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Accidents, incidents and near-misses"
        action={{ label: 'Report Incident', onClick: () => openDialog() }}
      />

      <Panel title="Summary" className="mb-5">
        <StatementLine label="On record" note={`${stats.total === 1 ? '1 incident' : `${stats.total} incidents`} in all`} value={stats.total} />
        <StatementLine label="Open cases" note="Reported or under review" value={stats.open} rule="single" tone={stats.open > 0 ? 'bad' : undefined} />
        <StatementLine label="Critical or major" value={stats.critical} rule="single" tone={stats.critical > 0 ? 'bad' : undefined} />
        <StatementLine label="With injuries" value={stats.withInjuries} rule="single" tone={stats.withInjuries > 0 ? 'bad' : undefined} />
      </Panel>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={FileWarning}
          title="No incidents reported"
          description="No incidents on record. That's a good thing."
          action={{ label: 'Report Incident', onClick: () => openDialog() }}
        />
      ) : (
        <>
          <RosterToolbar search={search} onSearch={setSearch} placeholder="Search by type, driver, truck, location">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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

          <Roster entries={entries} selectedIds={selectedIds} onToggle={toggleSelect} empty="No incidents match your filters." />
        </>
      )}

          <ConfirmDeleteDialog
            open={massDeleteOpen}
            onOpenChange={setMassDeleteOpen}
            onConfirm={async () => {
              setBulkUpdating(true);
              try {
                const { archiveManyWithUndo } = await import('@/lib/soft-delete');
                await archiveManyWithUndo({
                  table: 'incidents',
                  ids: [...selectedIds],
                  queryClient,
                  invalidateKeys: [['incidents']],
                });
                setSelectedIds(new Set());
                setMassDeleteOpen(false);
              } catch (e: any) { toast.error(e.message); }
              finally { setBulkUpdating(false); }
            }}
            title="Archive Selected Incidents"
            description={`Archive ${selectedIds.size} incident(s)? They can be restored from the Archive page.`}
            isDeleting={bulkUpdating}
          />
          <BulkStatusEditDialog
            open={massEditOpen}
            onOpenChange={setMassEditOpen}
            onConfirm={async (status) => {
              setBulkUpdating(true);
              try {
                const { error } = await supabase.from('incidents').update({ status }).in('id', [...selectedIds]);
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: ['incidents'] });
                toast.success(`${selectedIds.size} incident(s) updated`);
                setSelectedIds(new Set());
                setMassEditOpen(false);
              } catch (e: any) { toast.error(e.message); }
              finally { setBulkUpdating(false); }
            }}
            count={selectedIds.size}
            entityName="incidents"
            isUpdating={bulkUpdating}
            statusOptions={[
              { value: 'reported', label: 'Reported' },
              { value: 'under_review', label: 'Under Review' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIncident ? 'Edit Incident' : 'Report New Incident'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Incident Date/Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.incident_date ? format(parseISO(formData.incident_date), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={(e) => setFormData({ ...formData, incident_date: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Incident Type</Label>
                <Select value={formData.incident_type} onValueChange={(v) => setFormData({ ...formData, incident_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {incidentTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {severityLevels.map(l => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={formData.driver_id || 'none'} onValueChange={(v) => setFormData({ ...formData, driver_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Truck</Label>
                <Select value={formData.truck_id || 'none'} onValueChange={(v) => setFormData({ ...formData, truck_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {trucks.map(t => (
                      <SelectItem key={t.id} value={t.id}>#{t.unit_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trailer</Label>
                <Select value={formData.trailer_id || 'none'} onValueChange={(v) => setFormData({ ...formData, trailer_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Select trailer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {trailers.map(t => (
                      <SelectItem key={t.id} value={t.id}>#{t.unit_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location Description</Label>
              <Input
                value={formData.location_description || ''}
                onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
                placeholder="e.g., I-35 Northbound, mile marker 245"
              />
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what happened..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Police Report Number</Label>
                <Input
                  value={formData.police_report_number || ''}
                  onChange={(e) => setFormData({ ...formData, police_report_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Insurance Claim Number</Label>
                <Input
                  value={formData.insurance_claim_number || ''}
                  onChange={(e) => setFormData({ ...formData, insurance_claim_number: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Estimated Damage ($)</Label>
              <Input
                type="number"
                value={formData.estimated_damage || ''}
                onChange={(e) => setFormData({ ...formData, estimated_damage: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={formData.citation_issued || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, citation_issued: !!checked })}
                />
                <Label>Citation Issued</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={formData.injuries_reported || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, injuries_reported: !!checked })}
                />
                <Label>Injuries Reported</Label>
              </div>
            </div>

            {formData.injuries_reported && (
              <div className="space-y-2">
                <Label>Injury Details</Label>
                <Textarea
                  value={formData.injury_details || ''}
                  onChange={(e) => setFormData({ ...formData, injury_details: e.target.value })}
                  placeholder="Describe any injuries..."
                  rows={2}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Resolution Notes</Label>
              <Textarea
                value={formData.resolution_notes || ''}
                onChange={(e) => setFormData({ ...formData, resolution_notes: e.target.value })}
                placeholder="Notes about resolution or follow-up..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingIncident ? 'Update' : 'Report'} Incident
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Incident Sheet */}
      <Sheet open={!!viewingIncident} onOpenChange={() => setViewingIncident(null)}>
        <SheetContent className="w-[500px] sm:max-w-lg flex flex-col p-0 gap-0 overflow-hidden">
          <SheetHeader className="shrink-0 mx-0 mt-0 px-6 pt-6 pb-4 pr-12 border-b static">
            <SheetTitle>Incident Details</SheetTitle>
          </SheetHeader>
          {viewingIncident && (
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

              <div className="flex items-center gap-2">
                {getSeverityBadge(viewingIncident.severity)}
                <StatusBadge status={viewingIncident.status} />
              </div>

              <div className="divide-y">
                <StatementLine label="Date and time" value={<span className="text-base font-medium text-right">{format(parseISO(viewingIncident.incident_date), 'PPpp')}</span>} />
                <StatementLine label="Type" value={<span className="text-base font-medium text-right">{typeLabel(viewingIncident)}</span>} />
                <StatementLine label="Driver" value={<span className="text-base font-medium text-right">{getDriverName(viewingIncident.driver_id)}</span>} />
                <StatementLine label="Truck" value={<span className="text-base font-medium text-right">{getTruckName(viewingIncident.truck_id)}</span>} />
                <StatementLine label="Location" value={<span className="text-base font-medium text-right">{viewingIncident.location_description || 'Not set'}</span>} />
                <StatementLine label="Estimated damage" value={<span className="text-base font-medium text-right">{formatCurrencyValue(viewingIncident.estimated_damage)}</span>} />
                <StatementLine label="Citation issued" value={<span className="text-base font-medium text-right">{viewingIncident.citation_issued ? 'Yes' : 'No'}</span>} />
                <StatementLine label="Injuries reported" value={<span className="text-base font-medium text-right">{viewingIncident.injuries_reported ? 'Yes' : 'No'}</span>} />
                {viewingIncident.police_report_number && <StatementLine label="Police report" value={<span className="text-base font-medium">{viewingIncident.police_report_number}</span>} />}
                {viewingIncident.insurance_claim_number && <StatementLine label="Insurance claim" value={<span className="text-base font-medium">{viewingIncident.insurance_claim_number}</span>} />}
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">What happened</Label>
                  <p className="font-medium">{viewingIncident.description}</p>
                </div>
                {viewingIncident.injury_details && (
                  <div>
                    <Label className="text-muted-foreground">Injury details</Label>
                    <p className="font-medium">{viewingIncident.injury_details}</p>
                  </div>
                )}
                {viewingIncident.resolution_notes && (
                  <div>
                    <Label className="text-muted-foreground">Resolution notes</Label>
                    <p className="font-medium">{viewingIncident.resolution_notes}</p>
                  </div>
                )}
              </div>

              <Button onClick={() => { setViewingIncident(null); openDialog(viewingIncident); }} className="h-11 w-full">
                <Pencil className="h-4 w-4 mr-2" />
                Edit Incident
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
