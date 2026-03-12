import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { calculateRevenue as calculateRevenueFn } from '@/lib/revenue-calculator';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { ExpensesList } from '@/components/shared/ExpensesList';
import { RateConfirmationUpload } from '@/components/loads/RateConfirmationUpload';
import DriverLoadsView from '@/components/driver/DriverLoadsView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Pencil, Trash2, TrendingUp, DollarSign, Truck, MapPin, Plus, X, Receipt, History, MoreHorizontal, Mail } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatusHistoryLog } from '@/components/loads/StatusHistoryLog';

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
  const { hasRole, isAdmin, orgId } = useAuth();
  const isDriverOnly = hasRole('driver') && !isAdmin;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
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
      const { data, error } = await supabase.from('drivers_public_view').select('*').eq('status', 'active');
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

  const { data: trailers = [] } = useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trailers').select('*').in('status', ['active', 'in_use']);
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
          org_id: data.org_id,
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
        // Fetch the load's org_id for RLS compliance
        const { data: loadData } = await supabase.from('fleet_loads').select('org_id').eq('id', id).single();
        const accessorialRecords = accessorialItems.map((acc: Accessorial) => ({
          load_id: id,
          org_id: loadData?.org_id,
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

  // Auto-open dialog from command palette quick action
  useEffect(() => {
    if (searchParams.get('action') === 'new-load') {
      openDialog();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

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
  const calculateRevenueLocal = (data: any, accs: Accessorial[] = accessorials) => {
    const accessorialsTotal = accs.reduce((sum, acc) => sum + (acc.amount * (acc.percentage / 100)), 0);
    
    const result = calculateRevenueFn(
      {
        rate: parseFloat(data.rate) || 0,
        fuel_surcharge: parseFloat(data.fuel_surcharge) || 0,
        lumper: parseFloat(data.lumper) || 0,
        advance_taken: parseFloat(data.advance_taken) || 0,
        is_power_only: data.is_power_only,
        start_miles: parseInt(data.start_miles) || null,
        end_miles: parseInt(data.end_miles) || null,
        accessorialsTotal,
      },
      {
        truckPct: parseFloat(getSetting('truck_percentage', '65')) / 100,
        trailerPct: parseFloat(getSetting('trailer_percentage', '7')) / 100,
        advancePct: parseFloat(getSetting('advance_percentage', '30')) / 100,
        ownsTrailer: getSetting('owns_trailer', 'false') === 'true',
      }
    );

    return result;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.origin || !formData.destination) {
      toast.error('Origin and destination are required');
      return;
    }

    const calculated = calculateRevenueLocal(formData);
    const payload = {
      ...formData,
      ...calculated,
      org_id: orgId,
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

  // Format address for display - condense for mobile
  const formatAddressDisplay = (address: string | null) => {
    if (!address) return '-';
    
    const parts = address.split(',').map(p => p.trim());
    
    // Look for a part containing a 2-letter state abbreviation followed by a zip code
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].trim();
      // Match state + optional ZIP+4 (e.g. "KY 42240-4455" or "GA 30474" or just "GA")
      const stateMatch = part.match(/\b([A-Z]{2})\s*(\d{5}(-\d{4})?)?\b/);
      if (stateMatch) {
        // The city is the part immediately before the state part
        const city = i > 0 ? parts[i - 1].trim() : '';
        return { city, state: stateMatch[1], full: address };
      }
    }
    
    // Fallback: just return first meaningful part
    return { city: parts[0], state: '', full: address };
  };

  // Filter loads by month
  const filteredLoads = selectedMonth === 'all' 
    ? loads 
    : loads.filter((l: any) => l.pickup_date && l.pickup_date.startsWith(selectedMonth));

  // Helper to get display miles (actual if valid, otherwise booked)
  const getDisplayMiles = (load: any) => {
    return (load.actual_miles && load.actual_miles > 0) ? load.actual_miles : (load.booked_miles || 0);
  };

  // Calculate totals
  const totals = filteredLoads.reduce((acc: any, load: any) => ({
    loads: acc.loads + 1,
    rate: acc.rate + (load.rate || 0),
    fuelSurcharge: acc.fuelSurcharge + (load.fuel_surcharge || 0),
    accessorials: acc.accessorials + getLoadAccessorialsTotal(load.id),
    grossRevenue: acc.grossRevenue + (load.gross_revenue || 0),
    netRevenue: acc.netRevenue + (load.net_revenue || 0),
    settlement: acc.settlement + (load.settlement || 0),
    bookedMiles: acc.bookedMiles + (load.booked_miles || 0),
    actualMiles: acc.actualMiles + getDisplayMiles(load),
  }), { loads: 0, rate: 0, fuelSurcharge: 0, accessorials: 0, grossRevenue: 0, netRevenue: 0, settlement: 0, bookedMiles: 0, actualMiles: 0 });

  // Format intermediate stops for notes
  const formatIntermediateStops = (stops: any[]): string => {
    if (!stops || stops.length === 0) return '';
    
    const formattedStops = stops.map(stop => {
      const facility = stop.facility_name ? `${stop.facility_name}, ` : '';
      const date = stop.date ? ` - ${stop.date}` : '';
      return `Stop ${stop.stop_number} (${stop.stop_type}): ${facility}${stop.address}${date}`;
    }).join('\n');
    
    return `\n\n=== INTERMEDIATE STOPS ===\n${formattedStops}`;
  };

  // Handle extracted data from rate confirmation
  const handleRateConfirmationData = (data: any, existingLoadId?: string) => {
    // Map accessorials from the extracted data
    const extractedAccessorials: Accessorial[] = (data.accessorials || []).map((acc: any) => ({
      accessorial_type: acc.type === 'Stop Of' ? 'Stop-off' : acc.type,
      amount: acc.amount || 0,
      percentage: 100,
      notes: acc.notes,
    }));

    // Format intermediate stops to append to notes
    const intermediateStopsText = formatIntermediateStops(data.intermediate_stops);
    const combinedNotes = (data.notes || '') + intermediateStopsText;

    // If updating an existing load, find it and merge the data
    if (existingLoadId) {
      const existingLoad = loads.find((l: any) => l.id === existingLoadId);
      if (existingLoad) {
        // Merge: use extracted data where available, preserve existing data otherwise
        setFormData({
          landstar_load_id: data.landstar_load_id || existingLoad.landstar_load_id || '',
          agency_code: data.agency_code || existingLoad.agency_code || '',
          origin: data.origin || existingLoad.origin || '',
          destination: data.destination || existingLoad.destination || '',
          pickup_date: data.pickup_date || existingLoad.pickup_date || '',
          pickup_time: data.pickup_time || existingLoad.pickup_time || '',
          delivery_date: data.delivery_date || existingLoad.delivery_date || '',
          delivery_time: data.delivery_time || existingLoad.delivery_time || '',
          booked_miles: data.booked_miles || existingLoad.booked_miles || 0,
          rate: data.rate || existingLoad.rate || 0,
          fuel_surcharge: data.fuel_surcharge || existingLoad.fuel_surcharge || 0,
          driver_id: data.driver_id || existingLoad.driver_id || null,
          truck_id: data.truck_id || existingLoad.truck_id || null,
          // Append new notes to existing notes
          notes: existingLoad.notes 
            ? existingLoad.notes + (combinedNotes ? '\n\n--- Updated from Rate Confirmation ---' + combinedNotes : '')
            : combinedNotes,
          status: existingLoad.status || 'assigned',
          is_power_only: existingLoad.is_power_only || false,
          advance_taken: existingLoad.advance_taken || 0,
          lumper: existingLoad.lumper || 0,
          start_miles: existingLoad.start_miles || 0,
          end_miles: existingLoad.end_miles || 0,
        });
        
        setEditingLoad(existingLoad);
        setAccessorials(extractedAccessorials);
        setDialogOpen(true);
        toast.info('Updating existing load. Review changes and save when ready.');
        return;
      }
    }

    // Creating a new load
    setFormData({
      landstar_load_id: data.landstar_load_id || '',
      agency_code: data.agency_code || '',
      origin: data.origin || '',
      destination: data.destination || '',
      pickup_date: data.pickup_date || '',
      pickup_time: data.pickup_time || '',
      delivery_date: data.delivery_date || '',
      delivery_time: data.delivery_time || '',
      booked_miles: data.booked_miles || 0,
      rate: data.rate || 0,
      fuel_surcharge: data.fuel_surcharge || 0,
      driver_id: data.driver_id || null,
      truck_id: data.truck_id || null,
      notes: combinedNotes,
      status: 'assigned',
      is_power_only: false,
    });

    setAccessorials(extractedAccessorials);
    setEditingLoad(null);
    setDialogOpen(true);
    
    toast.info('Form pre-filled with extracted data. Review and save when ready.');
  };

  // Driver-only view - mobile-friendly, read-only except status updates
  if (isDriverOnly) {
    return (
      <>
        <PageHeader 
          title="My Loads" 
          description="View your assigned loads and update status" 
        />
        <DriverLoadsView />
      </>
    );
  }

  return (
    <>
      <PageHeader 
        title="Fleet Loads" 
        description="Track loads, revenue, and settlements" 
        action={{ label: 'Add Load', onClick: () => openDialog() }} 
      />

      {/* Rate Confirmation Upload */}
      <div className="mb-6">
        <RateConfirmationUpload
          onDataExtracted={handleRateConfirmationData}
          existingLoads={loads.map((l: any) => ({
            id: l.id,
            landstar_load_id: l.landstar_load_id,
            origin: l.origin,
            destination: l.destination,
            rate: l.rate,
            pickup_date: l.pickup_date,
          }))}
          drivers={drivers}
          trucks={trucks}
        />
      </div>

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
        <CardContent className="pt-6">
          <DataTable
            columns={[
              { key: 'pickup_date', header: 'Date', render: (load: any) => formatDate(load.pickup_date) },
              { key: 'landstar_load_id', header: 'Landstar ID', render: (load: any) => <span className="font-mono">{load.landstar_load_id || '-'}</span> },
              { key: 'tracking_id', header: 'Tracking ID', render: (load: any) => 
                load.tracking_id ? (
                  <span 
                    className="font-mono text-xs cursor-pointer hover:text-primary truncate max-w-[120px] inline-block"
                    title="Click to copy tracking link"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(`${window.location.origin}/track?tracking_id=${load.tracking_id}`);
                      toast.success('Tracking link copied!');
                    }}
                  >
                    {load.tracking_id.slice(0, 8)}…
                  </span>
                ) : <span className="text-muted-foreground">-</span>
              },
              { key: 'agency_code', header: 'Agent', render: (load: any) => <span className="font-mono text-xs">{load.agency_code || '-'}</span> },
              { key: 'origin', header: 'Origin', render: (load: any) => {
                const addr = formatAddressDisplay(load.origin);
                return typeof addr === 'string' ? addr : (
                  <div title={addr.full}>
                    {addr.city}{addr.state ? `, ${addr.state}` : ''}
                  </div>
                );
              }},
              { key: 'destination', header: 'Destination', render: (load: any) => {
                const addr = formatAddressDisplay(load.destination);
                return typeof addr === 'string' ? addr : (
                  <div title={addr.full}>
                    {addr.city}{addr.state ? `, ${addr.state}` : ''}
                  </div>
                );
              }},
              { key: 'rate', header: 'Rate', render: (load: any) => <span className="text-right">{formatCurrency(load.rate)}</span> },
              { key: 'fuel_surcharge', header: 'FSC', render: (load: any) => formatCurrency(load.fuel_surcharge) },
              { key: 'accessorials_total', header: 'Accessorials', render: (load: any) => formatCurrency(getLoadAccessorialsTotal(load.id)) },
              { key: 'net_revenue', header: 'Net Revenue', render: (load: any) => <span className="font-medium text-success">{formatCurrency(load.net_revenue)}</span> },
              { key: 'miles', header: 'Miles', render: (load: any) => 
                (load.actual_miles && load.actual_miles > 0) 
                  ? load.actual_miles.toLocaleString() 
                  : (load.booked_miles ? `${load.booked_miles.toLocaleString()}*` : '-')
              },
              { key: 'status', header: 'Status', render: (load: any) => <StatusBadge status={load.status} /> },
              { key: 'actions', header: '', render: (load: any) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDialog(load)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(load.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )},
            ]}
            data={filteredLoads}
            loading={isLoading}
            emptyMessage="No loads yet"
            tableId="fleet-loads"
            exportFilename="fleet-loads"
          />
          {filteredLoads.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-3 mt-2 rounded-lg bg-muted/50 text-sm font-medium border border-border">
              <span>Totals ({totals.loads} loads)</span>
              <span className="ml-auto">Rate: {formatCurrency(totals.rate)}</span>
              <span>FSC: {formatCurrency(totals.fuelSurcharge)}</span>
              <span>Acc: {formatCurrency(totals.accessorials)}</span>
              <span className="text-success">Net: {formatCurrency(totals.netRevenue)}</span>
              <span>{totals.actualMiles.toLocaleString()} mi</span>
            </div>
          )}
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
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="details">Load Details</TabsTrigger>
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
                <TabsTrigger value="miles">Miles</TabsTrigger>
                <TabsTrigger value="expenses" className="flex items-center gap-1">
                  <Receipt className="h-4 w-4" /> Expenses
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-1">
                  <History className="h-4 w-4" /> History
                </TabsTrigger>
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
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="at_pickup">At Pickup</SelectItem>
                        <SelectItem value="loading">Loading</SelectItem>
                        <SelectItem value="in_transit">In Transit</SelectItem>
                        <SelectItem value="at_delivery">At Delivery</SelectItem>
                        <SelectItem value="unloading">Unloading</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Auto Email Updates Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Auto Email Updates</p>
                      <p className="text-xs text-muted-foreground">Send status emails to the agent when this load's status changes</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.auto_email_updates ?? true}
                    onCheckedChange={(checked) => setFormData({ ...formData, auto_email_updates: checked })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="origin">Origin (Full Address) *</Label>
                    <Input 
                      id="origin" 
                      value={formData.origin || ''} 
                      onChange={(e) => setFormData({ ...formData, origin: e.target.value })} 
                      placeholder="1234 Industrial Blvd, Lewisville, TX 75057" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination">Destination (Full Address) *</Label>
                    <Input 
                      id="destination" 
                      value={formData.destination || ''} 
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })} 
                      placeholder="5678 Commerce Dr, Evans, CO 80620" 
                      required 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    <Label htmlFor="pickup_time">Pickup Time</Label>
                    <Input 
                      id="pickup_time" 
                      type="text" 
                      value={formData.pickup_time || ''} 
                      onChange={(e) => setFormData({ ...formData, pickup_time: e.target.value })} 
                      placeholder="8:00 AM"
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
                  <div className="space-y-2">
                    <Label htmlFor="delivery_time">Delivery Time</Label>
                    <Input 
                      id="delivery_time" 
                      type="text" 
                      value={formData.delivery_time || ''} 
                      onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })} 
                      placeholder="2:00 PM"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="trailer_id">Trailer</Label>
                    <Select value={formData.trailer_id || 'none'} onValueChange={(v) => setFormData({ ...formData, trailer_id: v === 'none' ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Select trailer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {trailers.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.unit_number}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="empty_miles">Empty / Deadhead Miles</Label>
                    <Input 
                      id="empty_miles" 
                      type="number" 
                      value={formData.empty_miles || ''} 
                      onChange={(e) => setFormData({ ...formData, empty_miles: parseInt(e.target.value) || 0 })} 
                      placeholder="0"
                    />
                  </div>
                </div>

              </TabsContent>

              <TabsContent value="revenue" className="space-y-4 mt-4">
                <div className="flex items-center space-x-2 pb-2">
                  <Checkbox 
                    id="is_power_only" 
                    checked={formData.is_power_only || false}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_power_only: checked })}
                  />
                  <Label htmlFor="is_power_only" className="font-normal cursor-pointer">Power Only (70% truck revenue, no trailer)</Label>
                </div>

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
                    <Label>Advance Available (FSC + 30% Rate)</Label>
                    <div className="h-10 px-3 py-2 rounded-md border bg-muted text-muted-foreground">
                      {formatCurrency((parseFloat(formData.fuel_surcharge) || 0) + ((parseFloat(formData.rate) || 0) * (parseFloat(getSetting('advance_percentage', '30')) / 100)))}
                    </div>
                  </div>
                </div>

                {/* Preview calculations */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3">Revenue Preview</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">Gross Revenue</p>
                      <p className="font-bold">{formatCurrency(calculateRevenueLocal(formData).gross_revenue)}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">Truck ({formData.is_power_only ? '70' : getSetting('truck_percentage', '65')}%)</p>
                      <p className="font-bold">{formatCurrency(calculateRevenueLocal(formData).truck_revenue)}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">Trailer ({getSetting('trailer_percentage', '7')}%)</p>
                      <p className="font-bold">{formatCurrency(calculateRevenueLocal(formData).trailer_revenue)}</p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <p className="text-muted-foreground">Net Revenue</p>
                      <p className="font-bold text-primary">{formatCurrency(calculateRevenueLocal(formData).net_revenue)}</p>
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

              <TabsContent value="expenses" className="mt-4">
                {editingLoad?.id ? (
                  <ExpensesList
                    relatedType="load"
                    relatedId={editingLoad.id}
                    title="Load Expenses"
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Save the load first to add expenses.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                {editingLoad?.id ? (
                  <StatusHistoryLog
                    loadId={editingLoad.id}
                    pickupDate={editingLoad.pickup_date}
                    pickupTime={editingLoad.pickup_time}
                    deliveryDate={editingLoad.delivery_date}
                    deliveryTime={editingLoad.delivery_time}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Save the load first to view status history.</p>
                  </div>
                )}
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
    </>
  );
}
