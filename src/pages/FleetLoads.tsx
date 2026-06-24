import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import { calculateRevenue as calculateRevenueFn } from '@/lib/revenue-calculator';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { ExpensesList } from '@/components/shared/ExpensesList';
import { RateConfirmationUpload } from '@/components/loads/RateConfirmationUpload';
import { SmartLoadCreator } from '@/components/loads/SmartLoadCreator';
import { IndependentLoadBuilder } from '@/components/loads/IndependentLoadBuilder';
import DriverLoadsView from '@/components/driver/DriverLoadsView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput, IntegerInput, PercentageInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Pencil, Trash2, TrendingUp, DollarSign, Truck, MapPin, Plus, X, Receipt, History, MoreHorizontal, Mail, FileText, FileCheck, ExternalLink, Image, Search } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatusHistoryLog } from '@/components/loads/StatusHistoryLog';
import { PODViewer } from '@/components/loads/PODViewer';
import { BrokerRateHistoryCard } from '@/components/loads/BrokerRateHistoryCard';
import { AgencyCRMStatusBadge } from '@/components/loads/AgencyCRMStatusBadge';
import { FeetInchesInput } from '@/components/shared/FeetInchesInput';
import {
  calcOverDimensionCharge,
  OVER_DIM_ACCESSORIAL_TYPE,
  OVER_DIM_AUTO_NOTE_PREFIX,
  type OverDimRule,
} from '@/utils/overDimension';
import { z } from 'zod';

export const IN_BOND_ACCESSORIAL_TYPE = 'In-Bond Fee (Rule 480)';
export const IN_BOND_AUTO_NOTE_PREFIX = 'Auto:';



// Accessorial types are now sourced from public.accessorial_types per-org lookup.

interface Accessorial {
  id?: string;
  accessorial_type: string;
  amount: number;
  percentage: number;
  notes?: string;
  is_driver_pay: boolean;
}
import { format, parseISO } from 'date-fns';

export default function FleetLoads() {
  const { hasRole, isAdmin, orgId } = useAuth();
  const { isIndependent, isLandstar } = useOrganizationMode();
  const isDriverOnly = hasRole('driver') && !isAdmin;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSetSearch = useDebouncedCallback((v: string) => setSearchTerm(v.trim().toLowerCase()), 300);
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [agencyBlocked, setAgencyBlocked] = useState(false);


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

  // Lookup: accessorial type catalog (per-org)
  const { data: accessorialTypes = [] } = useQuery({
    queryKey: ['accessorial_types', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accessorial_types')
        .select('id, name, default_is_driver_pay, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
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

  // Detention rules catalog (per-org) — Rule 500 with daily cap.
  const { data: detentionRules = [] } = useQuery({
    queryKey: ['detention_rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('detention_rules')
        .select('trailer_type, free_time_minutes, hourly_rate, max_charge_per_day');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Helper: derive the detention rule {hourly, cap} for the selected trailer on this load.
  const getDetentionRuleForLoad = (data: any): { rate: number; cap: number } => {
    const trailer = trailers.find((t: any) => t.id === data?.trailer_id);
    const type = trailer?.trailer_type;
    if (!type) return { rate: 0, cap: 0 };
    const rule = (detentionRules as any[]).find((r) => r.trailer_type === type);
    return {
      rate: Number(rule?.hourly_rate) || 0,
      cap: Number(rule?.max_charge_per_day) || 0,
    };
  };

  // Over-dimension (Rule 670) rules catalog (per-org)
  const { data: overDimRules = [] } = useQuery({
    queryKey: ['over_dimension_rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('over_dimension_rules')
        .select('dimension, min_inches, max_inches, cents_per_mile, min_charge');
      if (error) throw error;
      return (data ?? []) as OverDimRule[];
    },
  });

  // Compute the auto Over-Dimension accessorial for the current form, if any.
  const buildOverDimAccessorial = (data: any): Accessorial | null => {
    const miles = (Number(data?.actual_miles) > 0 ? Number(data?.actual_miles) : Number(data?.booked_miles)) || 0;
    const result = calcOverDimensionCharge({
      height_inches: data?.height_inches,
      width_inches: data?.width_inches,
      length_inches: data?.length_inches,
      miles,
      rules: overDimRules as OverDimRule[],
    });
    if (result.charge_amount <= 0) return null;
    const parts = result.breakdown.map((b) => {
      const tag = b.dimension === 'height' ? 'H' : b.dimension === 'width' ? 'W' : 'L';
      return `${tag} ${b.value_in}" → $${b.cpm.toFixed(2)}/mi`;
    });
    return {
      accessorial_type: OVER_DIM_ACCESSORIAL_TYPE,
      amount: result.charge_amount,
      percentage: 100,
      notes: `${OVER_DIM_AUTO_NOTE_PREFIX} ${parts.join(', ')} × ${miles} mi`,
      is_driver_pay: false,
    };
  };

  // Compute the auto In-Bond (Rule 480) accessorial when the load is flagged.
  const buildInBondAccessorial = (data: any): Accessorial | null => {
    if (!data?.is_in_bond) return null;
    const cf = (data.cf_7512_number ?? '').toString().trim();
    if (!cf) return null;
    const fee = parseFloat(getSetting('in_bond_fee', '100')) || 0;
    if (fee <= 0) return null;
    return {
      accessorial_type: IN_BOND_ACCESSORIAL_TYPE,
      amount: fee,
      percentage: 100,
      notes: `${IN_BOND_AUTO_NOTE_PREFIX} Rule 480 fee · CF 7512 #${cf}`,
      is_driver_pay: false,
    };
  };



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
          is_driver_pay: acc.is_driver_pay,
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
          is_driver_pay: acc.is_driver_pay,
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
    if (load) {
      // Strip enrichment-only fields that are not columns on fleet_loads
      const { driver_name, truck_unit, ...cleanLoad } = load;
      setFormData(cleanLoad);
    } else {
      setFormData({
        status: 'pending',
        is_power_only: false,
      });
    }
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
          is_driver_pay: a.is_driver_pay !== false,
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
    const action = searchParams.get('action');
    const loadId = searchParams.get('loadId');
    if (action === 'new-load') {
      openDialog();
      setSearchParams({}, { replace: true });
    } else if (action === 'bulk-status') {
      if (selectedIds.size > 0) {
        setMassEditOpen(true);
      } else {
        toast.info('Select one or more loads first, then press ⌘K → Change Load Status');
      }
      setSearchParams({}, { replace: true });
    } else if (loadId) {
      const load = loads?.find((l: any) => l.id === loadId);
      if (load) openDialog(load);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, loads]);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingLoad(null);
    setFormData({});
    setAccessorials([]);
  };

  // Accessorial management
  const addAccessorial = () => {
    const first = accessorialTypes[0];
    setAccessorials([
      ...accessorials,
      {
        accessorial_type: first?.name ?? 'Detention',
        amount: 0,
        percentage: 100,
        is_driver_pay: first?.default_is_driver_pay ?? true,
      },
    ]);
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
    if (agencyBlocked) {
      toast.error('This agency is marked DO NOT USE in the CRM. Change the agency code to continue.');
      return;
    }


    // In-Bond / Rule 480 client-side validation (server enforces too)
    const inBondSchema = z.object({
      is_in_bond: z.boolean().optional(),
      cf_7512_number: z.string().trim().max(64, 'CF 7512 number must be 64 characters or fewer').optional().nullable(),
    }).refine(
      (v) => !v.is_in_bond || (typeof v.cf_7512_number === 'string' && v.cf_7512_number.trim().length > 0),
      { message: 'CF 7512 number is required for In-Bond shipments', path: ['cf_7512_number'] },
    );
    const parsed = inBondSchema.safeParse({
      is_in_bond: !!formData.is_in_bond,
      cf_7512_number: formData.cf_7512_number ?? null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'Invalid In-Bond fields');
      return;
    }

    const calculated = calculateRevenueLocal(formData);
    // Strip non-column enrichment fields before sending to Supabase
    const { driver_name: _dn, truck_unit: _tu, ...cleanFormData } = formData;
    const payload = {
      ...cleanFormData,
      ...calculated,
      org_id: orgId,
      cf_7512_number: formData.is_in_bond ? (formData.cf_7512_number ?? '').trim() : null,
      negotiation_notes: formData.negotiation_notes || null,
      pickup_number: formData.pickup_number?.trim() ? formData.pickup_number.trim() : null,
    };

    // Strip any prior auto-generated rows, then re-inject if applicable.
    const manualAccessorials = accessorials.filter(
      (a) =>
        !(a.accessorial_type === OVER_DIM_ACCESSORIAL_TYPE && (a.notes ?? '').startsWith(OVER_DIM_AUTO_NOTE_PREFIX)) &&
        !(a.accessorial_type === IN_BOND_ACCESSORIAL_TYPE && (a.notes ?? '').startsWith(IN_BOND_AUTO_NOTE_PREFIX))
    );
    const autoOverDim = buildOverDimAccessorial(payload);
    const autoInBond = buildInBondAccessorial(payload);
    const finalAccessorials = [
      ...manualAccessorials,
      ...(autoOverDim ? [autoOverDim] : []),
      ...(autoInBond ? [autoInBond] : []),
    ];

    if (editingLoad) {
      updateMutation.mutate({ id: editingLoad.id, updates: payload, accessorialItems: finalAccessorials });
    } else {
      createMutation.mutate({ load: payload, accessorials: finalAccessorials });
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
  const monthFilteredLoads = selectedMonth === 'all'
    ? loads
    : loads.filter((l: any) => l.pickup_date && l.pickup_date.startsWith(selectedMonth));

  // Enrich with driver_name + truck_unit so columns, sort, and filter all use the same field
  const enrichedAll = monthFilteredLoads.map((l: any) => {
    const driver = l.driver_id ? drivers.find((d: any) => d.id === l.driver_id) : null;
    const truck = l.truck_id ? trucks.find((t: any) => t.id === l.truck_id) : null;
    return {
      ...l,
      driver_name: driver ? `${driver.first_name} ${driver.last_name}` : 'Unassigned',
      truck_unit: truck?.unit_number || 'Unassigned',
    };
  });

  // Omni-search: case-insensitive contains across multiple fields
  const SEARCH_FIELDS = ['landstar_load_id', 'origin', 'destination', 'status', 'notes', 'pickup_number', 'driver_name', 'truck_unit'];
  const enrichedLoads = searchTerm
    ? enrichedAll.filter((l: any) =>
        SEARCH_FIELDS.some((f) => {
          const v = l[f];
          return v != null && String(v).toLowerCase().includes(searchTerm);
        })
      )
    : enrichedAll;
  const filteredLoads = enrichedLoads;

  // Helper to get display miles (actual if valid, otherwise booked)
  const getDisplayMiles = (load: any) => {
    return (load.actual_miles && load.actual_miles > 0) ? load.actual_miles : (load.booked_miles || 0);
  };

  // Calculate totals
  // Exclude cancelled loads from totals — they should not count toward gross/net income.
  const totals = filteredLoads
    .filter((load: any) => load.status !== 'cancelled')
    .reduce((acc: any, load: any) => ({
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
      is_driver_pay: true,
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
        {isIndependent ? (
          <SmartLoadCreator
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
        ) : (
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
        )}
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

      {/* Search + Month Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            rightIcon={
              searchInput ? (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setSearchTerm(''); }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : undefined
            }
            placeholder="Search loads by ID, origin, destination, status, driver, truck…"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
          />
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-full sm:w-48">
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
          {searchTerm && filteredLoads.length === 0 ? (
            <EmptyState
              icon={Search}
              title={`No loads found matching "${searchInput}"`}
              description="Try a different search term, or clear the search to see all loads."
              action={{ label: 'Clear Search', onClick: () => { setSearchInput(''); setSearchTerm(''); } }}
            />
          ) : (
          <DataTable
            columns={[
              { key: 'pickup_date', header: 'Date', render: (load: any) => formatDate(load.pickup_date) },
              { key: 'landstar_load_id', header: isLandstar ? 'Landstar ID' : 'Load ID', hiddenOnMobile: true, render: (load: any) => (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono">{load.landstar_load_id || '-'}</span>
                  {load.is_in_bond && (
                    <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30" title={load.cf_7512_number ? `CF 7512: ${load.cf_7512_number}` : 'In-Bond shipment'}>
                      IN-BOND
                    </span>
                  )}
                </div>
              ) },
              { key: 'tracking_id', header: 'Tracking ID', hiddenOnMobile: true, render: (load: any) => 
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
              { key: 'agency_code', header: 'Agent', hiddenOnMobile: true, render: (load: any) => <span className="font-mono text-xs">{load.agency_code || '-'}</span> },
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
              { key: 'fuel_surcharge', header: 'FSC', hiddenOnMobile: true, render: (load: any) => formatCurrency(load.fuel_surcharge) },
              { key: 'accessorials_total', header: 'Accessorials', hiddenOnMobile: true, render: (load: any) => formatCurrency(getLoadAccessorialsTotal(load.id)) },
              { key: 'net_revenue', header: 'Net Revenue', render: (load: any) => <span className="font-medium text-success">{formatCurrency(load.net_revenue)}</span> },
              { key: 'miles', header: 'Miles', render: (load: any) => 
                (load.actual_miles && load.actual_miles > 0) 
                  ? load.actual_miles.toLocaleString() 
                  : (load.booked_miles ? `${load.booked_miles.toLocaleString()}*` : '-')
              },
              { key: 'status', header: 'Status', render: (load: any) => <StatusBadge status={load.status} /> },
              {
                key: 'driver_name',
                header: 'Driver',
                sortable: true,
                filter: { type: 'text', accessor: (l: any) => l.driver_name },
                render: (load: any) => (
                  load.driver_id
                    ? <span>{load.driver_name}</span>
                    : <span className="text-muted-foreground italic">Unassigned</span>
                ),
              },
              {
                key: 'truck_unit',
                header: 'Truck #',
                sortable: true,
                filter: { type: 'text', accessor: (l: any) => l.truck_unit },
                render: (load: any) => (
                  load.truck_id
                    ? <span className="font-mono">{load.truck_unit}</span>
                    : <span className="text-muted-foreground italic">Unassigned</span>
                ),
              },
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
            data={enrichedLoads}
            loading={isLoading}
            emptyMessage="No loads yet"
            emptyDescription="Create your first load to start tracking revenue and miles."
            emptyIcon={Truck}
            emptyAction={{ label: 'Add First Load', onClick: () => openDialog() }}
            tableId="fleet-loads"
            exportFilename="fleet-loads"
            onRowDoubleClick={(load) => openDialog(load)}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            bulkActions={(ids) => (
              <>
                <Button size="sm" variant="outline" onClick={() => setMassEditOpen(true)}>
                  <Pencil className="mr-1 h-3 w-3" /> Edit ({ids.size})
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setMassDeleteOpen(true)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Delete ({ids.size})
                </Button>
              </>
            )}
          />
          )}
          <ConfirmDeleteDialog
            open={massDeleteOpen}
            onOpenChange={setMassDeleteOpen}
            onConfirm={async () => {
              setBulkUpdating(true);
              try {
                const { error } = await supabase.from('fleet_loads').delete().in('id', [...selectedIds]);
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
                toast.success(`${selectedIds.size} load(s) deleted`);
                setSelectedIds(new Set());
                setMassDeleteOpen(false);
              } catch (e: any) { toast.error(e.message); }
              finally { setBulkUpdating(false); }
            }}
            title="Delete Selected Loads"
            description={`Are you sure you want to delete ${selectedIds.size} load(s)? This action cannot be undone.`}
            isDeleting={bulkUpdating}
          />
          <BulkStatusEditDialog
            open={massEditOpen}
            onOpenChange={setMassEditOpen}
            onConfirm={async (status) => {
              setBulkUpdating(true);
              try {
                const { error } = await supabase.from('fleet_loads').update({ status }).in('id', [...selectedIds]);
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
                toast.success(`${selectedIds.size} load(s) updated`);
                setSelectedIds(new Set());
                setMassEditOpen(false);
              } catch (e: any) { toast.error(e.message); }
              finally { setBulkUpdating(false); }
            }}
            count={selectedIds.size}
            entityName="loads"
            isUpdating={bulkUpdating}
            statusOptions={[
              { value: 'pending', label: 'Pending' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'in_transit', label: 'In Transit' },
              { value: 'delivered', label: 'Delivered' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
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
          {isIndependent && !editingLoad ? (
            <IndependentLoadBuilder
              onSave={(data) => {
                const intermediateStopsText = formatIntermediateStops(
                  (data.intermediate_stops || []).map((s: any, i: number) => ({
                    stop_number: i + 1,
                    stop_type: 'intermediate',
                    facility_name: s.facility_name,
                    address: s.address,
                    date: s.date,
                  }))
                );
                const notes = [
                  data.shipper_facility ? `Shipper: ${data.shipper_facility}` : '',
                  data.consignee_facility ? `Consignee: ${data.consignee_facility}` : '',
                  data.commodity ? `Commodity: ${data.commodity}` : '',
                  data.weight ? `Weight: ${data.weight} lbs` : '',
                  data.equipment ? `Equipment: ${data.equipment}` : '',
                  data.broker_name ? `Broker: ${data.broker_name}` : '',
                  data.factoring_approved ? 'Factoring: Approved' : '',
                  intermediateStopsText,
                ].filter(Boolean).join('\n');

                const payload = {
                  landstar_load_id: data.landstar_load_id || null,
                  origin: data.origin,
                  destination: data.destination,
                  pickup_date: data.pickup_date || null,
                  pickup_time: data.pickup_time || null,
                  delivery_date: data.delivery_date || null,
                  delivery_time: data.delivery_time || null,
                  rate: data.rate || 0,
                  fuel_surcharge: 0,
                  notes,
                  status: 'pending',
                  is_power_only: false,
                  org_id: orgId,
                };
                const calculated = calculateRevenueLocal(payload);
                createMutation.mutate({ load: { ...payload, ...calculated }, accessorials: [] });
              }}
              onCancel={closeDialog}
            />
          ) : (
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="details">Load Details</TabsTrigger>
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
                <TabsTrigger value="miles">Miles</TabsTrigger>
                <TabsTrigger value="expenses" className="flex items-center gap-1">
                  <Receipt className="h-4 w-4" /> Expenses
                </TabsTrigger>
                <TabsTrigger value="pod" className="flex items-center gap-1">
                  <FileCheck className="h-4 w-4" /> POD
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-1">
                  <History className="h-4 w-4" /> History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                {/* In-Bond (Rule 480) compliance flag */}
                <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="is_in_bond"
                      checked={!!formData.is_in_bond}
                      onCheckedChange={(checked) =>
                        setFormData((prev: any) => ({
                          ...prev,
                          is_in_bond: !!checked,
                          cf_7512_number: checked ? prev.cf_7512_number ?? '' : null,
                        }))
                      }
                      className="mt-1"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="is_in_bond" className="font-medium cursor-pointer">
                        In-Bond / International Shipment (Rule 480)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Adds a <strong>Company</strong> accessorial of ${parseFloat(getSetting('in_bond_fee', '100')).toFixed(2)} and warns the driver not to break the customs seal.
                      </p>
                    </div>
                  </div>
                  {formData.is_in_bond && (
                    <div className="space-y-1 pl-6">
                      <Label htmlFor="cf_7512_number" className="text-xs font-semibold">
                        CF 7512 Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="cf_7512_number"
                        value={formData.cf_7512_number ?? ''}
                        onChange={(e) => setFormData({ ...formData, cf_7512_number: e.target.value })}
                        placeholder="e.g. 123-45678901"
                        maxLength={64}
                        required
                        className="pl-4 sm:pl-3 h-10 font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="landstar_load_id">{isLandstar ? 'Landstar Load ID' : 'Load ID'}</Label>
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
                    <AgencyCRMStatusBadge agencyCode={formData.agency_code} onBlockedChange={setAgencyBlocked} />
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

                {/* POD Required Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">POD Required</p>
                      <p className="text-xs text-muted-foreground">Require Transflo POD link and signature on delivery</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.pod_required ?? true}
                    onCheckedChange={(checked) => setFormData({ ...formData, pod_required: checked })}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pickup_number">Pickup Number (PU#)</Label>
                    <Input
                      id="pickup_number"
                      value={formData.pickup_number || ''}
                      onChange={(e) => setFormData({ ...formData, pickup_number: e.target.value })}
                      placeholder="e.g. PU-48291 (shown to driver at guard shack)"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    <Label htmlFor="pickup_time_type">Pickup Time Type</Label>
                    <Select value={formData.pickup_time_type || 'appointment'} onValueChange={(v) => setFormData({ ...formData, pickup_time_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="appointment">Strict Appointment</SelectItem>
                        <SelectItem value="window">Open Window</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="delivery_time_type">Delivery Time Type</Label>
                    <Select value={formData.delivery_time_type || 'appointment'} onValueChange={(v) => setFormData({ ...formData, delivery_time_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="appointment">Strict Appointment</SelectItem>
                        <SelectItem value="window">Open Window</SelectItem>
                      </SelectContent>
                    </Select>
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

                {/* Freight dimensions — drives Rule 670 Over-Dimension auto-billing */}
                {(() => {
                  const milesForPreview = (Number(formData.actual_miles) > 0 ? Number(formData.actual_miles) : Number(formData.booked_miles)) || 0;
                  const preview = calcOverDimensionCharge({
                    height_inches: formData.height_inches,
                    width_inches: formData.width_inches,
                    length_inches: formData.length_inches,
                    miles: milesForPreview,
                    rules: overDimRules as OverDimRule[],
                  });
                  const anyDim = !!(formData.height_inches || formData.width_inches || formData.length_inches);
                  return (
                    <div className="space-y-3 rounded-lg border border-border/60 p-3 bg-muted/20">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <Label className="text-sm font-semibold">Freight Dimensions <span className="text-xs font-normal text-muted-foreground">(Legal: 13'6" H × 8'6" W × 70' L)</span></Label>
                        {anyDim && (
                          preview.charge_amount > 0 ? (
                            <span className="text-xs font-medium px-2 py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300" title={preview.breakdown.map(b => `${b.dimension}: $${b.cpm.toFixed(2)}/mi`).join(' · ')}>
                              Over-Dimension · +${preview.total_cpm.toFixed(2)}/mi · ${preview.charge_amount.toFixed(2)} on {milesForPreview} mi
                            </span>
                          ) : (
                            <span className="text-xs font-medium px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Legal</span>
                          )
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="height_inches" className="text-xs">Height</Label>
                          <FeetInchesInput
                            id="height_inches"
                            valueInches={formData.height_inches}
                            onChange={(v) => setFormData({ ...formData, height_inches: v })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="width_inches" className="text-xs">Width</Label>
                          <FeetInchesInput
                            id="width_inches"
                            valueInches={formData.width_inches}
                            onChange={(v) => setFormData({ ...formData, width_inches: v })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="length_inches" className="text-xs">Length</Label>
                          <FeetInchesInput
                            id="length_inches"
                            valueInches={formData.length_inches}
                            onChange={(v) => setFormData({ ...formData, length_inches: v })}
                          />
                        </div>
                      </div>
                      {preview.charge_amount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          A <strong>Company</strong> accessorial of <strong>${preview.charge_amount.toFixed(2)}</strong> (Rule 670) will be added on save. Not paid to the driver.
                        </p>
                      )}
                    </div>
                  );
                })()}



                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="empty_miles">Empty / Deadhead Miles</Label>
                    <IntegerInput
                      id="empty_miles"
                      value={formData.empty_miles ?? ''}
                      onChange={(v) => setFormData({ ...formData, empty_miles: v === '' ? 0 : parseInt(v, 10) })}
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
                    <CurrencyInput
                      id="rate"
                      value={formData.rate ?? ''}
                      onChange={(v) => setFormData({ ...formData, rate: v === '' ? 0 : parseFloat(v) })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="booked_miles">Booked Miles</Label>
                    <IntegerInput
                      id="booked_miles"
                      value={formData.booked_miles ?? ''}
                      onChange={(v) => setFormData({ ...formData, booked_miles: v === '' ? 0 : parseInt(v, 10) })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fuel_surcharge">Fuel Surcharge ($)</Label>
                    <CurrencyInput
                      id="fuel_surcharge"
                      value={formData.fuel_surcharge ?? ''}
                      onChange={(v) => setFormData({ ...formData, fuel_surcharge: v === '' ? 0 : parseFloat(v) })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Lumper - shown for both modes */}
                <div className="space-y-2">
                  <Label htmlFor="lumper">Lumper ($)</Label>
                  <CurrencyInput
                    id="lumper"
                    value={formData.lumper ?? ''}
                    onChange={(v) => setFormData({ ...formData, lumper: v === '' ? 0 : parseFloat(v) })}
                    placeholder="0.00"
                  />
                </div>

                {/* Detention - hours-based with auto-computed $ from trailer-type rule (Rule 500) */}
                {(() => {
                  const { rate, cap } = getDetentionRuleForLoad(formData);
                  const hours = parseFloat(formData.detention_hours ?? '0') || 0;
                  const uncapped = hours * rate;
                  const days = hours > 0 ? Math.ceil(hours / 24) : 0;
                  const capped = cap > 0 ? Math.min(uncapped, cap * days) : uncapped;
                  const computed = +capped.toFixed(2);
                  const trailer = trailers.find((t: any) => t.id === formData?.trailer_id);
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                      <div className="space-y-2">
                        <Label htmlFor="detention_hours">Detention Hours</Label>
                        <Input
                          id="detention_hours"
                          type="number"
                          min={0}
                          step="0.25"
                          value={formData.detention_hours ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            const h = v === '' ? 0 : parseFloat(v);
                            const u = h * rate;
                            const d = h > 0 ? Math.ceil(h / 24) : 0;
                            const c = cap > 0 ? Math.min(u, cap * d) : u;
                            setFormData({ ...formData, detention_hours: v === '' ? null : h, detention_pay: +c.toFixed(2) });
                          }}
                          placeholder="0"
                          className="pl-4 sm:pl-3 h-12"
                        />
                        <p className="text-xs text-muted-foreground">
                          {trailer?.trailer_type
                            ? `Rate: $${rate.toFixed(2)}/hr · Cap $${cap.toFixed(2)}/day (${trailer.trailer_type})`
                            : 'Select a trailer to auto-fill the rate.'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="detention_pay">Detention Pay ($)</Label>
                        <CurrencyInput
                          id="detention_pay"
                          value={formData.detention_pay ?? ''}
                          onChange={(v) => setFormData({ ...formData, detention_pay: v === '' ? 0 : parseFloat(v) })}
                          placeholder={computed ? computed.toFixed(2) : '0.00'}
                        />
                        <p className="text-xs text-muted-foreground">
                          Auto-calculated (Rule 500); override if needed.
                        </p>
                      </div>
                    </div>
                  );
                })()}

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
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={acc.accessorial_type}
                              onValueChange={(v) => {
                                const match = accessorialTypes.find((t: any) => t.name === v);
                                const updated = [...accessorials];
                                updated[index] = {
                                  ...updated[index],
                                  accessorial_type: v,
                                  // Auto-apply the catalog default; dispatcher can still override via the Payable To select.
                                  is_driver_pay: match ? !!match.default_is_driver_pay : updated[index].is_driver_pay,
                                };
                                setAccessorials(updated);
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Preserve legacy free-text values not in the catalog */}
                                {acc.accessorial_type &&
                                  !accessorialTypes.some((t: any) => t.name === acc.accessorial_type) && (
                                    <SelectItem value={acc.accessorial_type}>
                                      {acc.accessorial_type} (legacy)
                                    </SelectItem>
                                  )}
                                {accessorialTypes.map((t: any) => (
                                  <SelectItem key={t.id} value={t.name}>
                                    {t.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Payable To</Label>
                            <Select
                              value={acc.is_driver_pay ? 'driver' : 'company'}
                              onValueChange={(v) => updateAccessorial(index, 'is_driver_pay', v === 'driver')}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="driver">Driver</SelectItem>
                                <SelectItem value="company">Company</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Amount ($)</Label>
                            <CurrencyInput
                              className="h-9"
                              value={acc.amount ?? ''}
                              onChange={(v) => updateAccessorial(index, 'amount', v === '' ? 0 : parseFloat(v))}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">% Paid</Label>
                            <PercentageInput
                              className="h-9"
                              value={acc.percentage ?? ''}
                              onChange={(v) => updateAccessorial(index, 'percentage', v === '' ? 100 : parseFloat(v))}
                              placeholder="100"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Net</Label>
                            {acc.is_driver_pay ? (
                              <div className="h-9 px-2 py-1.5 rounded-md border bg-muted text-sm font-medium">
                                {formatCurrency(acc.amount * (acc.percentage / 100))}
                              </div>
                            ) : (
                              <div className="h-9 px-2 py-1.5 rounded-md border bg-muted text-[11px] font-medium text-muted-foreground flex items-center">
                                Company expense
                              </div>
                            )}
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
                      <div className="flex flex-col items-end gap-0.5 pt-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total Accessorials: </span>
                          <span className="font-bold">{formatCurrency(calculateAccessorialsTotal())}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Driver portion:{' '}
                          <span className="font-semibold text-foreground">
                            {formatCurrency(
                              accessorials
                                .filter((a) => a.is_driver_pay)
                                .reduce((s, a) => s + (Number(a.amount) || 0) * ((Number(a.percentage) || 0) / 100), 0),
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Independent mode only: negotiation tools & broker history */}
                {isIndependent && (
                  <>
                    {/* Total Negotiated Rate Calculator */}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Total Negotiated Rate</span>
                        <span className="text-xl font-bold text-primary">
                          {formatCurrency(
                            (parseFloat(formData.rate) || 0) +
                            (parseFloat(formData.fuel_surcharge) || 0) +
                            calculateAccessorialsTotal() +
                            (parseFloat(formData.lumper) || 0)
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Line Haul + FSC + Accessorials + Lumper</p>
                    </div>

                    {/* Negotiation Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="negotiation_notes">Negotiation Notes</Label>
                      <Textarea
                        id="negotiation_notes"
                        value={formData.negotiation_notes || ''}
                        onChange={(e) => setFormData({ ...formData, negotiation_notes: e.target.value })}
                        placeholder="Rate negotiation details, broker counter-offers, etc."
                        rows={3}
                      />
                    </div>

                    {/* Broker Rate History Badge */}
                    {formData.agency_code && (
                      <BrokerRateHistoryCard agencyCode={formData.agency_code} currentLoads={loads} />
                    )}
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="advance_taken">Advance Taken ($)</Label>
                    <CurrencyInput
                      id="advance_taken"
                      value={formData.advance_taken ?? ''}
                      onChange={(v) => setFormData({ ...formData, advance_taken: v === '' ? 0 : parseFloat(v) })}
                      placeholder="0.00"
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
                    <IntegerInput
                      id="start_miles"
                      value={formData.start_miles ?? ''}
                      onChange={(v) => setFormData({ ...formData, start_miles: v === '' ? 0 : parseInt(v, 10) })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_miles">Ending Odometer</Label>
                    <IntegerInput
                      id="end_miles"
                      value={formData.end_miles ?? ''}
                      onChange={(v) => setFormData({ ...formData, end_miles: v === '' ? 0 : parseInt(v, 10) })}
                      placeholder="0"
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

              <TabsContent value="pod" className="mt-4">
                <PODViewer
                  podSignaturePath={editingLoad?.pod_signature_path}
                  podTransfloLink={editingLoad?.pod_transflo_link}
                />
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
              <Button type="submit" className="gradient-gold text-primary-foreground" disabled={agencyBlocked}>
                {editingLoad ? 'Save Changes' : 'Add Load'}
              </Button>

            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
