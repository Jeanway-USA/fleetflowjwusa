import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
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
import { Plus, AlertTriangle, Eye, Pencil, Trash2, FileWarning, Car, Users, Camera } from 'lucide-react';
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

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
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
      const { data, error } = await supabase.from('trucks').select('id, unit_number');
      if (error) throw error;
      return data;
    },
  });

  const { data: trailers = [] } = useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trailers').select('id, unit_number');
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
      const { error } = await supabase.from('incidents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Incident deleted');
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

  return (
    <>
      <PageHeader 
        title="Incident Reports" 
        description="Track and manage accidents, incidents, and near-misses"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Incidents</CardTitle>
            <FileWarning className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Open Cases</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.open}</div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Critical/Major</CardTitle>
            <Car className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">With Injuries</CardTitle>
            <Users className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.withInjuries}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>All Incidents</CardTitle>
            <CardDescription>View and manage all reported incidents</CardDescription>
          </div>
          <Button onClick={() => openDialog()} className="gradient-gold text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Report Incident
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: 'incident_date', header: 'Date', render: (i: Incident) => format(parseISO(i.incident_date), 'MM/dd/yyyy') },
              { key: 'incident_type', header: 'Type', render: (i: Incident) => <span className="capitalize">{i.incident_type.replace('_', ' ')}</span> },
              { key: 'severity', header: 'Severity', render: (i: Incident) => getSeverityBadge(i.severity) },
              { key: 'driver_id', header: 'Driver', render: (i: Incident) => getDriverName(i.driver_id) },
              { key: 'truck_id', header: 'Truck', render: (i: Incident) => getTruckName(i.truck_id) },
              { key: 'location_description', header: 'Location', render: (i: Incident) => <span className="max-w-[200px] truncate block">{i.location_description || '-'}</span> },
              { key: 'estimated_damage', header: 'Damage Est.', render: (i: Incident) => formatCurrencyValue(i.estimated_damage) },
              { key: 'status', header: 'Status', render: (i: Incident) => <StatusBadge status={i.status} /> },
              { key: 'actions', header: 'Actions', render: (incident: Incident) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setViewingIncident(incident)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openDialog(incident)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(incident.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )},
            ]}
            data={incidents}
            loading={isLoading}
            emptyMessage="No incidents reported"
            tableId="incidents"
            exportFilename="incidents"
          />
        </CardContent>
      </Card>

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
        <SheetContent className="w-[500px] sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Incident Details</SheetTitle>
          </SheetHeader>
          {viewingIncident && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-2">
                {getSeverityBadge(viewingIncident.severity)}
                <StatusBadge status={viewingIncident.status} />
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Date/Time</Label>
                  <p className="font-medium">{format(parseISO(viewingIncident.incident_date), 'PPpp')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium capitalize">{viewingIncident.incident_type.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Driver</Label>
                  <p className="font-medium">{getDriverName(viewingIncident.driver_id)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Truck</Label>
                  <p className="font-medium">{getTruckName(viewingIncident.truck_id)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Location</Label>
                  <p className="font-medium">{viewingIncident.location_description || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="font-medium">{viewingIncident.description}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Estimated Damage</Label>
                  <p className="font-medium">{formatCurrencyValue(viewingIncident.estimated_damage)}</p>
                </div>
                {viewingIncident.police_report_number && (
                  <div>
                    <Label className="text-muted-foreground">Police Report</Label>
                    <p className="font-medium">{viewingIncident.police_report_number}</p>
                  </div>
                )}
                {viewingIncident.insurance_claim_number && (
                  <div>
                    <Label className="text-muted-foreground">Insurance Claim</Label>
                    <p className="font-medium">{viewingIncident.insurance_claim_number}</p>
                  </div>
                )}
                <div className="flex gap-4">
                  <div>
                    <Label className="text-muted-foreground">Citation Issued</Label>
                    <p className="font-medium">{viewingIncident.citation_issued ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Injuries</Label>
                    <p className="font-medium">{viewingIncident.injuries_reported ? 'Yes' : 'No'}</p>
                  </div>
                </div>
                {viewingIncident.injury_details && (
                  <div>
                    <Label className="text-muted-foreground">Injury Details</Label>
                    <p className="font-medium">{viewingIncident.injury_details}</p>
                  </div>
                )}
                {viewingIncident.resolution_notes && (
                  <div>
                    <Label className="text-muted-foreground">Resolution Notes</Label>
                    <p className="font-medium">{viewingIncident.resolution_notes}</p>
                  </div>
                )}
              </div>

              <Button onClick={() => { setViewingIncident(null); openDialog(viewingIncident); }} className="w-full">
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
