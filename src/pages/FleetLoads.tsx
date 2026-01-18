import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Pencil, Trash2, TrendingUp, DollarSign, Truck, MapPin, Plus, X } from 'lucide-react';

// Accessorial types commonly used in trucking
const ACCESSORIAL_TYPES = [
  'Detention',
  'Layover',
  'Lumper',
  'TONU',
  'Deadhead',
  'Stop-off',
  'Unloading',
  'Inside Delivery',
  'Lift Gate',
  'Other',
];

interface Accessorial {
  id?: string;
  accessorial_type: string;
  amount: number;
  percentage: number;
  notes?: string;
}
import { format, parseISO } from 'date-fns';

export default function FleetLoads() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);

  // Fetch settings for calculations
  const { data: settings = [] } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*');
      if (error) throw error;
      return data;
    },
  });

  const getSetting = (key: string, defaultValue: string = '0') => {
    const setting = settings.find((s: any) => s.setting_key === key);
    return setting?.setting_value || defaultValue;
  };

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*').order('pickup_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allAccessorials = [] } = useQuery({
    queryKey: ['load_accessorials'],
    queryFn: async () => {
      const { data, error } = await supabase.from('load_accessorials').select('*');
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
    mutationFn: async ({ load, accessorials: accs }: { load: any; accessorials: Accessorial[] }) => {
      const { data, error } = await supabase.from('fleet_loads').insert(load).select().single();
      if (error) throw error;
      
      // Insert accessorials if any
      if (accs.length > 0) {
        const accessorialRecords = accs.map(acc => ({
          load_id: data.id,
          accessorial_type: acc.accessorial_type,
          amount: acc.amount,
          percentage: acc.percentage,
          notes: acc.notes,
        }));
        const { error: accError } = await supabase.from('load_accessorials').insert(accessorialRecords);
        if (accError) throw accError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      queryClient.invalidateQueries({ queryKey: ['load_accessorials'] });
      toast.success('Load created successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates, accessorialItems }: { id: string; updates: any; accessorialItems: Accessorial[] }) => {
      const { error } = await supabase.from('fleet_loads').update(updates).eq('id', id);
      if (error) throw error;

      // Delete existing accessorials and insert new ones
      const { error: deleteError } = await supabase.from('load_accessorials').delete().eq('load_id', id);
      if (deleteError) throw deleteError;

      if (accessorialItems.length > 0) {
        const accessorialRecords = accessorialItems.map((acc: Accessorial) => ({
          load_id: id,
          accessorial_type: acc.accessorial_type,
          amount: acc.amount,
          percentage: acc.percentage,
          notes: acc.notes,
        }));
        const { error: accError } = await supabase.from('load_accessorials').insert(accessorialRecords);
        if (accError) throw accError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      queryClient.invalidateQueries({ queryKey: ['load_accessorials'] });
      toast.success('Load updated successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fleet_loads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      queryClient.invalidateQueries({ queryKey: ['load_accessorials'] });
      toast.success('Load deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const openDialog = async (load?: any) => {
    setEditingLoad(load || null);
    setFormData(load || { 
      status: 'pending',
      is_power_only: false,
    });
    // Load existing accessorials for this load - fetch fresh from database
    if (load?.id) {
      const { data: loadAccs } = await supabase
        .from('load_accessorials')
        .select('*')
        .eq('load_id', load.id);
      
      if (loadAccs && loadAccs.length > 0) {
        setAccessorials(loadAccs.map((a: any) => ({
          id: a.id,
          accessorial_type: a.accessorial_type,
          amount: Number(a.amount) || 0,
          percentage: Number(a.percentage) || 100,
          notes: a.notes,
        })));
      } else {
        setAccessorials([]);
      }
    } else {
      setAccessorials([]);
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingLoad(null);
    setFormData({});
    setAccessorials([]);
  };

  // Accessorial management
  const addAccessorial = () => {
    setAccessorials([...accessorials, { accessorial_type: 'Detention', amount: 0, percentage: 100 }]);
  };

  const removeAccessorial = (index: number) => {
    setAccessorials(accessorials.filter((_, i) => i !== index));
  };

  const updateAccessorial = (index: number, field: keyof Accessorial, value: any) => {
    const updated = [...accessorials];
    updated[index] = { ...updated[index], [field]: value };
    setAccessorials(updated);
  };

  // Calculate total accessorials amount
  const calculateAccessorialsTotal = () => {
    return accessorials.reduce((sum, acc) => sum + (acc.amount * (acc.percentage / 100)), 0);
  };

  // Get accessorials for a specific load (for display in table)
  const getLoadAccessorialsTotal = (loadId: string) => {
    const loadAccs = allAccessorials.filter((a: any) => a.load_id === loadId);
    return loadAccs.reduce((sum: number, acc: any) => sum + (acc.amount * (acc.percentage / 100)), 0);
  };

  // Calculate revenue based on compensation package
  const calculateRevenue = (data: any, accs: Accessorial[] = accessorials) => {
    const rate = parseFloat(data.rate) || 0;
    const fuelSurcharge = parseFloat(data.fuel_surcharge) || 0;
    const lumper = parseFloat(data.lumper) || 0;
    
    // Calculate accessorials total from the new structure
    const accessorialsTotal = accs.reduce((sum, acc) => sum + (acc.amount * (acc.percentage / 100)), 0);
    
    const truckPct = parseFloat(getSetting('truck_percentage', '65')) / 100;
    const trailerPct = parseFloat(getSetting('trailer_percentage', '7')) / 100;
    const advancePct = parseFloat(getSetting('advance_percentage', '30')) / 100;
    const ownsTrailer = getSetting('owns_trailer', 'false') === 'true';
    const isPowerOnly = data.is_power_only;

    const grossRevenue = rate + fuelSurcharge + accessorialsTotal;
    const advanceAvailable = rate * advancePct;
    const advanceTaken = parseFloat(data.advance_taken) || 0;
    
    let truckRevenue = grossRevenue * truckPct;
    let trailerRevenue = ownsTrailer ? grossRevenue * trailerPct : 0;
    
    if (isPowerOnly) {
      trailerRevenue = 0;
    }

    const netRevenue = truckRevenue + trailerRevenue;
    const settlement = netRevenue - advanceTaken - lumper;

    return {
      gross_revenue: grossRevenue,
      advance_available: advanceAvailable,
      truck_revenue: truckRevenue,
      trailer_revenue: trailerRevenue,
      net_revenue: netRevenue,
      settlement: settlement,
      actual_miles: (parseInt(data.end_miles) || 0) - (parseInt(data.start_miles) || 0),
      accessorials: accessorialsTotal,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.origin || !formData.destination) {
      toast.error('Origin and destination are required');
      return;
    }

    const calculated = calculateRevenue(formData);
    const payload = {
      ...formData,
      ...calculated,
    };

    if (editingLoad) {
      updateMutation.mutate({ id: editingLoad.id, updates: payload, accessorialItems: accessorials });
    } else {
      createMutation.mutate({ load: payload, accessorials });
    }
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '-';
    const driver = drivers.find((d: any) => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : '-';
  };

  const getTruckUnit = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find((t: any) => t.id === truckId);
    return truck?.unit_number || '-';
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return format(parseISO(date), 'MM/dd/yyyy');
  };

  // Filter loads by month
  const filteredLoads = selectedMonth === 'all' 
    ? loads 
    : loads.filter((l: any) => l.pickup_date && l.pickup_date.startsWith(selectedMonth));

  // Calculate totals
  const totals = filteredLoads.reduce((acc: any, load: any) => ({
    loads: acc.loads + 1,
    rate: acc.rate + (load.rate || 0),
    fuelSurcharge: acc.fuelSurcharge + (load.fuel_surcharge || 0),
    grossRevenue: acc.grossRevenue + (load.gross_revenue || 0),
    netRevenue: acc.netRevenue + (load.net_revenue || 0),
    settlement: acc.settlement + (load.settlement || 0),
    bookedMiles: acc.bookedMiles + (load.booked_miles || 0),
    actualMiles: acc.actualMiles + (load.actual_miles || 0),
  }), { loads: 0, rate: 0, fuelSurcharge: 0, grossRevenue: 0, netRevenue: 0, settlement: 0, bookedMiles: 0, actualMiles: 0 });

  return (
    <DashboardLayout>
      <PageHeader 
        title="Fleet Loads" 
        description="Track loads, revenue, and settlements" 
        action={{ label: 'Add Load', onClick: () => openDialog() }} 
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Loads</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.loads}</div>
            <p className="text-xs text-muted-foreground">{totals.actualMiles.toLocaleString()} actual miles</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gross Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.grossRevenue)}</div>
            <p className="text-xs text-muted-foreground">Rate + FSC + Accessorials</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCurrency(totals.netRevenue)}</div>
            <p className="text-xs text-muted-foreground">Truck + Trailer share</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Per Mile</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.actualMiles > 0 ? formatCurrency(totals.netRevenue / totals.actualMiles) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Net revenue per mile</p>
          </CardContent>
        </Card>
      </div>

      {/* Month Filter */}
      <div className="flex gap-4 mb-4">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Loads</SelectItem>
            <SelectItem value="2026-01">January 2026</SelectItem>
            <SelectItem value="2026-02">February 2026</SelectItem>
            <SelectItem value="2026-03">March 2026</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loads Table */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Landstar ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">FSC</TableHead>
                  <TableHead className="text-right">Accessorials</TableHead>
                  <TableHead className="text-right">Net Revenue</TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filteredLoads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No loads yet</TableCell>
                  </TableRow>
                ) : (
                  filteredLoads.map((load: any) => (
                    <TableRow key={load.id}>
                      <TableCell>{formatDate(load.pickup_date)}</TableCell>
                      <TableCell className="font-mono">{load.landstar_load_id || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{load.agency_code || '-'}</TableCell>
                      <TableCell>{load.origin}</TableCell>
                      <TableCell>{load.destination}</TableCell>
                      <TableCell className="text-right">{formatCurrency(load.rate)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(load.fuel_surcharge)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(getLoadAccessorialsTotal(load.id))}</TableCell>
                      <TableCell className="text-right font-medium text-success">{formatCurrency(load.net_revenue)}</TableCell>
                      <TableCell className="text-right">{load.actual_miles?.toLocaleString() || '-'}</TableCell>
                      <TableCell><StatusBadge status={load.status} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openDialog(load)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(load.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {filteredLoads.length > 0 && (
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={5}>Totals ({totals.loads} loads)</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.rate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.fuelSurcharge)}</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(totals.netRevenue)}</TableCell>
                    <TableCell className="text-right">{totals.actualMiles.toLocaleString()}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Load Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLoad ? 'Edit Load' : 'Add New Load'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Load Details</TabsTrigger>
                <TabsTrigger value="revenue">Revenue & Advance</TabsTrigger>
                <TabsTrigger value="miles">Miles & Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="landstar_load_id">Landstar Load ID</Label>
                    <Input 
                      id="landstar_load_id" 
                      value={formData.landstar_load_id || ''} 
                      onChange={(e) => setFormData({ ...formData, landstar_load_id: e.target.value })} 
                      placeholder="8941232" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agency_code">Agency Code</Label>
                    <Input 
                      id="agency_code" 
                      value={formData.agency_code || ''} 
                      onChange={(e) => setFormData({ ...formData, agency_code: e.target.value.toUpperCase().slice(0, 3) })} 
                      placeholder="JNS"
                      maxLength={3}
                      className="font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status || 'pending'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
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
                    <Input 
                      id="origin" 
                      value={formData.origin || ''} 
                      onChange={(e) => setFormData({ ...formData, origin: e.target.value })} 
                      placeholder="Lewisville, TX" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination">Destination *</Label>
                    <Input 
                      id="destination" 
                      value={formData.destination || ''} 
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })} 
                      placeholder="Evans, CO" 
                      required 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pickup_date">Pickup Date</Label>
                    <Input 
                      id="pickup_date" 
                      type="date" 
                      value={formData.pickup_date || ''} 
                      onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery_date">Delivery Date</Label>
                    <Input 
                      id="delivery_date" 
                      type="date" 
                      value={formData.delivery_date || ''} 
                      onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="driver_id">Driver</Label>
                    <Select value={formData.driver_id || 'none'} onValueChange={(v) => setFormData({ ...formData, driver_id: v === 'none' ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {drivers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="truck_id">Truck</Label>
                    <Select value={formData.truck_id || 'none'} onValueChange={(v) => setFormData({ ...formData, truck_id: v === 'none' ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {trucks.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.unit_number}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="is_power_only" 
                    checked={formData.is_power_only || false}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_power_only: checked })}
                  />
                  <Label htmlFor="is_power_only" className="font-normal cursor-pointer">Power Only (No trailer revenue)</Label>
                </div>
              </TabsContent>

              <TabsContent value="revenue" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rate">Booked Linehaul ($)</Label>
                    <Input 
                      id="rate" 
                      type="number" 
                      step="0.01" 
                      value={formData.rate || ''} 
                      onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })} 
                      placeholder="2430.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="booked_miles">Booked Miles</Label>
                    <Input 
                      id="booked_miles" 
                      type="number" 
                      value={formData.booked_miles || ''} 
                      onChange={(e) => setFormData({ ...formData, booked_miles: parseInt(e.target.value) || 0 })} 
                      placeholder="810"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fuel_surcharge">Fuel Surcharge ($)</Label>
                    <Input 
                      id="fuel_surcharge" 
                      type="number" 
                      step="0.01" 
                      value={formData.fuel_surcharge || ''} 
                      onChange={(e) => setFormData({ ...formData, fuel_surcharge: parseFloat(e.target.value) || 0 })} 
                      placeholder="315.90"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lumper">Lumper ($)</Label>
                    <Input 
                      id="lumper" 
                      type="number" 
                      step="0.01" 
                      value={formData.lumper || ''} 
                      onChange={(e) => setFormData({ ...formData, lumper: parseFloat(e.target.value) || 0 })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fuel_advance">Fuel Advance ($)</Label>
                    <Input 
                      id="fuel_advance" 
                      type="number" 
                      step="0.01" 
                      value={formData.fuel_advance || ''} 
                      onChange={(e) => setFormData({ ...formData, fuel_advance: parseFloat(e.target.value) || 0 })} 
                    />
                  </div>
                </div>

                {/* Accessorials Section */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-medium">Accessorials</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addAccessorial}>
                      <Plus className="h-4 w-4 mr-1" /> Add Accessorial
                    </Button>
                  </div>
                  
                  {accessorials.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No accessorials added. Click "Add Accessorial" to add detention, layover, etc.</p>
                  ) : (
                    <div className="space-y-3">
                      {accessorials.map((acc, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/50 rounded-lg">
                          <div className="col-span-4 space-y-1">
                            <Label className="text-xs">Type</Label>
                            <Select 
                              value={acc.accessorial_type} 
                              onValueChange={(v) => updateAccessorial(index, 'accessorial_type', v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ACCESSORIAL_TYPES.map(type => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">Amount ($)</Label>
                            <Input 
                              type="number" 
                              step="0.01"
                              className="h-9"
                              value={acc.amount || ''} 
                              onChange={(e) => updateAccessorial(index, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">% Paid</Label>
                            <Input 
                              type="number" 
                              min="0" 
                              max="100"
                              className="h-9"
                              value={acc.percentage || ''} 
                              onChange={(e) => updateAccessorial(index, 'percentage', parseFloat(e.target.value) || 100)}
                              placeholder="100"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Net</Label>
                            <div className="h-9 px-2 py-1.5 rounded-md border bg-muted text-sm font-medium">
                              {formatCurrency(acc.amount * (acc.percentage / 100))}
                            </div>
                          </div>
                          <div className="col-span-1">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-destructive"
                              onClick={() => removeAccessorial(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end pt-2">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Total Accessorials: </span>
                          <span className="font-bold">{formatCurrency(calculateAccessorialsTotal())}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="advance_taken">Advance Taken ($)</Label>
                    <Input 
                      id="advance_taken" 
                      type="number" 
                      step="0.01" 
                      value={formData.advance_taken || ''} 
                      onChange={(e) => setFormData({ ...formData, advance_taken: parseFloat(e.target.value) || 0 })} 
                      placeholder="456.50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Advance Available (calculated)</Label>
                    <div className="h-10 px-3 py-2 rounded-md border bg-muted text-muted-foreground">
                      {formatCurrency((parseFloat(formData.rate) || 0) * (parseFloat(getSetting('advance_percentage', '30')) / 100))}
                    </div>
                  </div>
                </div>

                {/* Preview calculations */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3">Revenue Preview</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">Gross Revenue</p>
                      <p className="font-bold">{formatCurrency(calculateRevenue(formData).gross_revenue)}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">Truck ({getSetting('truck_percentage', '65')}%)</p>
                      <p className="font-bold">{formatCurrency(calculateRevenue(formData).truck_revenue)}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">Trailer ({getSetting('trailer_percentage', '7')}%)</p>
                      <p className="font-bold">{formatCurrency(calculateRevenue(formData).trailer_revenue)}</p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <p className="text-muted-foreground">Net Revenue</p>
                      <p className="font-bold text-primary">{formatCurrency(calculateRevenue(formData).net_revenue)}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="miles" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_miles">Starting Odometer</Label>
                    <Input 
                      id="start_miles" 
                      type="number" 
                      value={formData.start_miles || ''} 
                      onChange={(e) => setFormData({ ...formData, start_miles: parseInt(e.target.value) || 0 })} 
                      placeholder="647744"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_miles">Ending Odometer</Label>
                    <Input 
                      id="end_miles" 
                      type="number" 
                      value={formData.end_miles || ''} 
                      onChange={(e) => setFormData({ ...formData, end_miles: parseInt(e.target.value) || 0 })} 
                      placeholder="648611"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Actual Miles (calculated)</Label>
                    <div className="h-10 px-3 py-2 rounded-md border bg-muted text-muted-foreground">
                      {((parseInt(formData.end_miles) || 0) - (parseInt(formData.start_miles) || 0)).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes / Comments</Label>
                  <Textarea 
                    id="notes" 
                    value={formData.notes || ''} 
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
                    placeholder="Stop over in Denver, etc." 
                    rows={4}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
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
