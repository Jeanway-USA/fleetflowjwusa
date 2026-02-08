import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Pencil, Trash2, Building2, Phone, Mail, Clock, Search, MapPin } from 'lucide-react';

const FACILITY_TYPES = [
  { value: 'shipper', label: 'Shipper' },
  { value: 'receiver', label: 'Receiver' },
  { value: 'both', label: 'Shipper & Receiver' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'terminal', label: 'Terminal' },
];

interface FacilityFormData {
  name: string;
  facility_type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  operating_hours: string;
  dock_info: string;
  appointment_required: boolean;
  notes: string;
}

const emptyForm: FacilityFormData = {
  name: '',
  facility_type: 'shipper',
  address: '',
  city: '',
  state: '',
  zip: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  operating_hours: '',
  dock_info: '',
  appointment_required: false,
  notes: '',
};

interface FacilitiesTabProps {
  canEdit: boolean;
}

export function FacilitiesTab({ canEdit }: FacilitiesTabProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FacilityFormData>(emptyForm);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const { data: facilities = [], isLoading } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facilities')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FacilityFormData) => {
      const { error } = await supabase.from('facilities').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      toast.success('Facility added');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FacilityFormData }) => {
      const { error } = await supabase.from('facilities').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      toast.success('Facility updated');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('facilities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      toast.success('Facility deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openDialog = (facility?: any) => {
    if (facility) {
      setEditingId(facility.id);
      setFormData({
        name: facility.name || '',
        facility_type: facility.facility_type || 'shipper',
        address: facility.address || '',
        city: facility.city || '',
        state: facility.state || '',
        zip: facility.zip || '',
        contact_name: facility.contact_name || '',
        contact_phone: facility.contact_phone || '',
        contact_email: facility.contact_email || '',
        operating_hours: facility.operating_hours || '',
        dock_info: facility.dock_info || '',
        appointment_required: facility.appointment_required || false,
        notes: facility.notes || '',
      });
    } else {
      setEditingId(null);
      setFormData(emptyForm);
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address) {
      toast.error('Name and address are required');
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filtered = facilities.filter((f: any) => {
    const matchesSearch = !searchQuery || 
      f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.state?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.address?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || f.facility_type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'shipper': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'receiver': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'both': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'warehouse': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'terminal': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return '';
    }
  };

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search facilities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {FACILITY_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit && (
          <Button onClick={() => openDialog()} className="sm:ml-auto">
            <Building2 className="h-4 w-4 mr-2" />
            Add Facility
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5 mb-6">
        {FACILITY_TYPES.map(type => {
          const count = facilities.filter((f: any) => f.facility_type === type.value).length;
          return (
            <Card key={type.value} className="card-elevated">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{type.label}s</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Table */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Appt</TableHead>
                  {canEdit && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No facilities found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getTypeBadgeColor(f.facility_type)}>
                          {f.facility_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="text-sm">
                            <div>{f.city}{f.state ? `, ${f.state}` : ''} {f.zip || ''}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{f.address}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {f.contact_name && (
                          <div className="text-sm">
                            <div>{f.contact_name}</div>
                            {f.contact_phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" />{f.contact_phone}
                              </div>
                            )}
                            {f.contact_email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />{f.contact_email}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {f.operating_hours && (
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {f.operating_hours}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {f.appointment_required ? (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Required</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openDialog(f)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(f.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Facility' : 'Add Facility'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Facility Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="ABC Distribution" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.facility_type} onValueChange={(v) => setFormData({ ...formData, facility_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FACILITY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address *</Label>
              <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Main St" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Dallas" />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} placeholder="TX" maxLength={2} />
              </div>
              <div className="space-y-2">
                <Label>ZIP</Label>
                <Input value={formData.zip} onChange={(e) => setFormData({ ...formData, zip: e.target.value })} placeholder="75201" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formData.contact_phone} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={formData.contact_email} onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operating Hours</Label>
                <Input value={formData.operating_hours} onChange={(e) => setFormData({ ...formData, operating_hours: e.target.value })} placeholder="Mon-Fri 6AM-6PM" />
              </div>
              <div className="space-y-2">
                <Label>Dock Info</Label>
                <Input value={formData.dock_info} onChange={(e) => setFormData({ ...formData, dock_info: e.target.value })} placeholder="4 docks, back-in only" />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="appointment_required"
                checked={formData.appointment_required}
                onCheckedChange={(checked) => setFormData({ ...formData, appointment_required: !!checked })}
              />
              <Label htmlFor="appointment_required">Appointment Required</Label>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? 'Update' : 'Add'} Facility
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
