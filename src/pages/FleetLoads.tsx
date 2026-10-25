import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import { calculateRevenue as calculateRevenueFn } from '@/lib/revenue-calculator';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Roster, RosterToolbar, RosterBulkBar, downloadCsv, type RosterEntry } from '@/components/fleet/Roster';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Field, FormSection } from '@/components/shared/FormParts';
import { summarize } from '@/lib/revenue-overview';
import { ExpensesList } from '@/components/shared/ExpensesList';
import { RateConfirmationUpload } from '@/components/loads/RateConfirmationUpload';
import { SmartLoadCreator } from '@/components/loads/SmartLoadCreator';
import { IndependentLoadBuilder } from '@/components/loads/IndependentLoadBuilder';
import { IntermediateStopsView } from '@/components/loads/IntermediateStopsView';
import { StopTime } from '@/components/shared/StopTime';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StateMark } from '@/components/shared/StateMark';
import { useHighlightRow } from '@/hooks/useHighlightRow';
import { cityState } from '@/lib/formatters';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Pencil, Trash2, TrendingUp, DollarSign, Truck, MapPin, Plus, X, Receipt, History, MoreHorizontal, Mail, FileText, FileCheck, ExternalLink, Image, Search, Archive, CheckCircle2, Upload, Download } from 'lucide-react';
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
  // Opening /fleet-loads?highlight=<id> (e.g. from the Today logbook) flashes that load.
  useHighlightRow();
  const { hasRole, isAdmin, orgId } = useAuth();
  const { isIndependent, isLandstar } = useOrganizationMode();
  const isDriverOnly = hasRole('driver') && !isAdmin;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showRateConUpload, setShowRateConUpload] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSetSearch = useDebouncedCallback((v: string) => setSearchTerm(v.trim().toLowerCase()), 300);
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);
  const [pendingIntermediateStops, setPendingIntermediateStops] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [agencyBlocked, setAgencyBlocked] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [bulkImporting, setBulkImporting] = useState(false);


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
      const { data, error } = await supabase.from('fleet_loads').select('*').is('deleted_at', null).order('pickup_date', { ascending: false });
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
      const { data, error } = await supabase.from('load_accessorials').select('*').is('deleted_at', null);
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



  // Replace intermediate stop rows for a load. Maps the flat extraction shape
  // ({stop_number, stop_type, facility_name, address, date}) into the structured
  // load_intermediate_stops schema.
  const replaceIntermediateStops = async (loadId: string, orgIdForLoad: string, stops: any[]) => {
    const client = supabase as any;
    const { error: delErr } = await client
      .from('load_intermediate_stops')
      .delete()
      .eq('load_id', loadId);
    if (delErr) throw delErr;
    if (!stops || stops.length === 0) return;
    const rows = stops.map((s: any, idx: number) => ({
      load_id: loadId,
      org_id: orgIdForLoad,
      stop_number: s.stop_number ?? idx + 1,
      stop_type: s.stop_type ?? null,
      facility_name: s.facility_name ?? null,
      location: s.address ?? s.location ?? '',
      scheduled_date: s.date ?? s.scheduled_date ?? null,
      status: s.status ?? 'pending',
      remaining_hos: s.remaining_hos ?? null,
      completed_at: s.completed_at ?? null,
    })).filter((r: any) => r.location);
    if (rows.length === 0) return;
    const { error: insErr } = await client.from('load_intermediate_stops').insert(rows);
    if (insErr) throw insErr;
  };

  const createMutation = useMutation({
    mutationFn: async ({ load, accessorials: accs, intermediateStops }: { load: any; accessorials: Accessorial[]; intermediateStops?: any[] }) => {
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

      // Persist structured intermediate stops
      if (intermediateStops && intermediateStops.length > 0) {
        await replaceIntermediateStops(data.id, data.org_id, intermediateStops);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      queryClient.invalidateQueries({ queryKey: ['load_accessorials'] });
      queryClient.invalidateQueries({ queryKey: ['load_intermediate_stops'] });
      toast.success('Load created successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates, accessorialItems, intermediateStops }: { id: string; updates: any; accessorialItems: Accessorial[]; intermediateStops?: any[] }) => {
      const { error } = await supabase.from('fleet_loads').update(updates).eq('id', id);
      if (error) throw error;

      // Delete existing accessorials and insert new ones
      const { error: deleteError } = await supabase.from('load_accessorials').delete().eq('load_id', id);
      if (deleteError) throw deleteError;

      // Fetch the load's org_id for RLS compliance (used for both accessorials + stops)
      const { data: loadData } = await supabase.from('fleet_loads').select('org_id').eq('id', id).single();

      if (accessorialItems.length > 0) {
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

      // Only replace intermediate stops when caller explicitly provided a set
      // (undefined = leave existing stops untouched; [] = clear)
      if (intermediateStops !== undefined && loadData?.org_id) {
        await replaceIntermediateStops(id, loadData.org_id, intermediateStops);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      queryClient.invalidateQueries({ queryKey: ['load_accessorials'] });
      queryClient.invalidateQueries({ queryKey: ['load_intermediate_stops'] });
      toast.success('Load updated successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { archiveWithUndo } = await import('@/lib/soft-delete');
      await archiveWithUndo({
        table: 'fleet_loads',
        id,
        queryClient,
        invalidateKeys: [['fleet_loads'], ['load_accessorials']],
      });
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
        .eq('load_id', load.id)
        .is('deleted_at', null);
      
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

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!isXlsx) {
      toast.error('Only .xlsx files are supported for bulk upload');
      return;
    }
    if (!orgId) {
      toast.error('Missing organization context');
      return;
    }
    setBulkImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
      if (raw.length === 0) {
        toast.error('The spreadsheet is empty');
        return;
      }
      const pick = (row: Record<string, any>, keys: string[]) => {
        const map = new Map<string, any>();
        for (const k of Object.keys(row)) map.set(k.toLowerCase().trim(), row[k]);
        for (const k of keys) {
          const v = map.get(k.toLowerCase());
          if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
        return null;
      };
      const buildAddress = (city: any, state: any, zip: any, combined: any) => {
        if (combined) return String(combined).trim();
        const parts = [city, state].filter((p) => p != null && String(p).trim() !== '').map((p) => String(p).trim());
        const base = parts.join(', ');
        const z = zip != null && String(zip).trim() !== '' ? String(zip).trim() : '';
        return [base, z].filter(Boolean).join(' ') || null;
      };
      const parseDate = (v: any): string | null => {
        if (v == null || v === '') return null;
        if (typeof v === 'number') {
          const d = XLSX.SSF?.parse_date_code?.(v);
          if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        const s = String(v).trim();
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        return null;
      };
      const rows = raw.map((r) => {
        const origin = buildAddress(
          pick(r, ['Origin City', 'origin_city']),
          pick(r, ['Origin State', 'origin_state']),
          pick(r, ['Origin Zip', 'Origin ZIP', 'origin_zip']),
          pick(r, ['Origin', 'origin']),
        );
        const destination = buildAddress(
          pick(r, ['Destination City', 'destination_city']),
          pick(r, ['Destination State', 'destination_state']),
          pick(r, ['Destination Zip', 'Destination ZIP', 'destination_zip']),
          pick(r, ['Destination', 'destination']),
        );
        const rate = pick(r, ['Gross Revenue', 'Rate', 'rate', 'gross_revenue']);
        return {
          org_id: orgId,
          landstar_load_id: pick(r, ['Landstar Load ID', 'Load ID', 'landstar_load_id', 'load_id']) || null,
          origin,
          destination,
          pickup_date: parseDate(pick(r, ['Pickup Date', 'pickup_date'])),
          delivery_date: parseDate(pick(r, ['Delivery Date', 'delivery_date'])),
          rate: rate != null ? Number(String(rate).replace(/[^0-9.\-]/g, '')) || null : null,
          commodity: pick(r, ['Commodity', 'commodity']),
          weight: (() => {
            const w = pick(r, ['Weight', 'weight']);
            return w != null ? Number(String(w).replace(/[^0-9.\-]/g, '')) || null : null;
          })(),
          agency_code: pick(r, ['Agency Code', 'agency_code', 'Agent']),
          status: 'pending',
        };
      }).filter((r) => r.origin || r.destination || r.landstar_load_id);

      if (rows.length === 0) {
        toast.error('No valid rows found. Expected columns like Load ID, Origin, Destination.');
        return;
      }
      const { error } = await supabase.from('fleet_loads').insert(rows);
      if (error) throw error;
      toast.success(`Imported ${rows.length} load${rows.length === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
    } catch (err: any) {
      console.error('Bulk upload failed:', err);
      toast.error(err?.message || 'Bulk upload failed');
    } finally {
      setBulkImporting(false);
    }
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
    setPendingIntermediateStops([]);
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
        powerOnlyPct: parseFloat(getSetting('power_only_percentage', '70')) / 100,
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

    // Only pass intermediateStops when the user actually provided a fresh set
    // (from rate-conf extraction or independent builder). Otherwise leave them
    // untouched on edit.
    const stopsArg = pendingIntermediateStops.length > 0 ? pendingIntermediateStops : undefined;

    if (editingLoad) {
      updateMutation.mutate({ id: editingLoad.id, updates: payload, accessorialItems: finalAccessorials, intermediateStops: stopsArg });
    } else {
      createMutation.mutate({ load: payload, accessorials: finalAccessorials, intermediateStops: stopsArg });
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

    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].trim();
      const stateMatch = part.match(/\b([A-Z]{2})\s*(\d{5}(-\d{4})?)?\b/);
      if (stateMatch) {
        const city = i > 0 ? parts[i - 1].trim() : '';
        return { city, state: stateMatch[1], zip: stateMatch[2] || '', full: address };
      }
    }

    return { city: parts[0], state: '', zip: '', full: address };
  };

  const wholeDollars = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  // Months that actually have loads, newest first (by delivery, else pickup).
  const loadMonths = Array.from(
    new Set(loads.map((l: any) => (l.delivery_date || l.pickup_date || '').slice(0, 7)).filter(Boolean)),
  ).sort().reverse() as string[];

  // Filter loads by month of delivery (falls back to pickup for undelivered loads),
  // so monthly income here matches the Finance hub and Executive Dashboard.
  const monthFilteredLoads = selectedMonth === 'all'
    ? loads
    : loads.filter((l: any) => (l.delivery_date || l.pickup_date || '').startsWith(selectedMonth));

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

  const PENDING_STATUS_LIST = ['pending', 'assigned', 'dispatched', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading'];

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
  const filteredLoads = enrichedLoads.filter((l: any) =>
    statusFilter === 'all' ? true : statusFilter === 'open' ? PENDING_STATUS_LIST.includes(l.status) : l.status === statusFilter,
  );

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

  // KPI-specific aggregates
  const PENDING_STATUSES = new Set(['pending', 'assigned', 'dispatched', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading']);
  const pendingIncome = filteredLoads
    .filter((l: any) => PENDING_STATUSES.has(l.status))
    .reduce((sum: number, l: any) => sum + (l.gross_revenue || 0), 0);
  const pendingCount = filteredLoads.filter((l: any) => PENDING_STATUSES.has(l.status)).length;
  const completedCount = filteredLoads.filter((l: any) => l.status === 'delivered').length;

  const timeframeLabel = isLoading
    ? 'Loading loads…'
    : selectedMonth === 'all'
    ? `Showing all loads · ${totals.loads} total`
    : (() => {
        try {
          const d = parseISO(`${selectedMonth}-01`);
          return `Showing ${format(d, 'MMMM yyyy')} · ${totals.loads} loads`;
        } catch {
          return `Showing ${selectedMonth} · ${totals.loads} loads`;
        }
      })();

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
        setPendingIntermediateStops(data.intermediate_stops || []);
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
    setPendingIntermediateStops(data.intermediate_stops || []);
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

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deliveredLoads = filteredLoads.filter((l: any) => l.status === 'delivered');
  const overview = summarize(deliveredLoads as any[]);
  const day = (d: string | null) => (d ? format(parseISO(d), 'EEE MMM d') : 'Not set');
  const noLoadsAtAll = !isLoading && loads.length === 0;

  const entries: RosterEntry[] = filteredLoads.map((load: any) => {
    const loadId = load.landstar_load_id || load.load_reference || (load.id ? `#${String(load.id).slice(0, 8)}` : 'No trip #');
    const miles = getDisplayMiles(load);
    const lane = `${cityState(load.origin) || 'Origin not set'} to ${cityState(load.destination) || 'Destination not set'}`;
    const dates = load.pickup_date || load.delivery_date ? `${day(load.pickup_date)} to ${day(load.delivery_date)}` : null;
    const yours = load.net_revenue ?? load.rate;
    return {
      id: load.id,
      title: loadId,
      onOpen: () => openDialog(load),
      chips: (
        <>
          <StatusBadge status={load.status} />
          {load.is_in_bond && (
            <span className="rounded-md bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive" title={load.cf_7512_number ? `CF 7512: ${load.cf_7512_number}` : 'In-bond shipment'}>
              In-bond
            </span>
          )}
        </>
      ),
      subtitle: (
        <>
          <span className="font-medium text-foreground">{lane}</span>
          <span className="block tabular-nums">{[dates, load.agency_code ? `Agent ${load.agency_code}` : null].filter(Boolean).join(', ')}</span>
        </>
      ),
      facts: [
        { label: 'Your share', value: formatCurrency(yours), tone: 'good' as const },
        { label: 'Billed in all', value: formatCurrency(load.gross_revenue ?? load.rate) },
        { label: 'Miles', value: miles > 0 ? `${Number(miles).toLocaleString()}${load.actual_miles > 0 ? '' : ' booked'}` : <span className="font-normal text-muted-foreground">Not set</span> },
        { label: 'Driver', value: load.driver_id ? load.driver_name : <span className="font-normal text-muted-foreground">Unassigned</span> },
      ],
      menu: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for load ${loadId}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openDialog(load)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(load.id)}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };
  });

  const exportCsv = () =>
    downloadCsv(
      'loads',
      ['Date', isLandstar ? 'Landstar ID' : 'Load ID', 'Agent', 'Origin', 'Destination', 'Linehaul', 'Fuel surcharge', 'Accessorials', 'Billed in all', 'Your share', 'Miles', 'Status', 'Driver', 'Truck'],
      filteredLoads.map((l: any) => [l.pickup_date, l.landstar_load_id, l.agency_code, l.origin, l.destination, l.rate, l.fuel_surcharge, getLoadAccessorialsTotal(l.id), l.gross_revenue, l.net_revenue, getDisplayMiles(l), l.status, l.driver_name, l.truck_unit]),
    );

  return (
    <>
      <PageHeader title="Loads" description={timeframeLabel} action={{ label: 'Add load', onClick: () => openDialog() }}>
        <Button variant="outline" className="h-11 sm:h-10" onClick={() => setShowRateConUpload((v) => !v)} aria-expanded={showRateConUpload}>
          <FileText className="mr-2 h-4 w-4" /> Rate confirmation
        </Button>
        <Button variant="outline" className="hidden sm:inline-flex" onClick={() => bulkInputRef.current?.click()} disabled={bulkImporting}>
          <Upload className="mr-2 h-4 w-4" /> {bulkImporting ? 'Uploading…' : 'Bulk upload'}
        </Button>
        <input ref={bulkInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleBulkUpload} />
      </PageHeader>

      {showRateConUpload && (
        <div className="mb-5">
          {isIndependent ? (
            <SmartLoadCreator
              onDataExtracted={handleRateConfirmationData}
              existingLoads={loads.map((l: any) => ({ id: l.id, landstar_load_id: l.landstar_load_id, origin: l.origin, destination: l.destination, rate: l.rate, pickup_date: l.pickup_date }))}
              drivers={drivers}
              trucks={trucks}
            />
          ) : (
            <RateConfirmationUpload
              onDataExtracted={handleRateConfirmationData}
              existingLoads={loads.map((l: any) => ({ id: l.id, landstar_load_id: l.landstar_load_id, origin: l.origin, destination: l.destination, rate: l.rate, pickup_date: l.pickup_date }))}
              drivers={drivers}
              trucks={trucks}
            />
          )}
        </div>
      )}

      {noLoadsAtAll ? (
        <EmptyState icon={Truck} title="No loads yet" description="Create your first load to start tracking revenue and miles." action={{ label: 'Add First Load', onClick: () => openDialog() }} />
      ) : (
        <>
          <Panel title="Delivered loads" description={selectedMonth === 'all' ? 'Every delivered load shown below, counted the way Landstar counts it.' : 'Delivered loads in this month.'} className="mb-5">
            <StatementLine label="Billed to customers" note={`All-in gross before Landstar's cut. ${overview.shipments.toLocaleString()} loads, ${overview.billedMiles.toLocaleString()} billed miles.`} value={isLoading ? '…' : wholeDollars(overview.gross)} />
            <StatementLine label="Landstar's cut" note="Their share of linehaul" value={isLoading ? '…' : `−${wholeDollars(overview.landstarCut)}`} rule="single" />
            <StatementLine label="Your revenue" note={overview.billedMiles > 0 ? `${formatCurrency(overview.netRate)} a mile, ${formatCurrency(overview.allInRate)} a mile all-in` : undefined} value={isLoading ? '…' : wholeDollars(overview.yours)} strong rule="double" />
            <StatementLine label="Not delivered yet" note="Booked, assigned or on the road" value={`${pendingCount} ${pendingCount === 1 ? 'load' : 'loads'}, ${wholeDollars(pendingIncome)}`} muted rule="single" />
          </Panel>

          <RosterToolbar
            search={searchInput}
            onSearch={(v) => { setSearchInput(v); debouncedSetSearch(v); }}
            placeholder="Search trip, city, driver"
          >
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Month">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {loadMonths.map((m) => (
                  <SelectItem key={m} value={m}>{format(parseISO(`${m}-01`), 'MMMM yyyy')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Not delivered</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-11" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
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

          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Roster entries={entries} selectedIds={selectedIds} onToggle={toggleSelect} empty={searchTerm ? `No loads match "${searchInput}".` : 'No loads match your filters.'} />
          )}
        </>
      )}

      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={async () => {
          setBulkUpdating(true);
          try {
            const { archiveManyWithUndo } = await import('@/lib/soft-delete');
            await archiveManyWithUndo({ table: 'fleet_loads', ids: [...selectedIds], queryClient, invalidateKeys: [['fleet_loads']] });
            setSelectedIds(new Set());
            setMassDeleteOpen(false);
          } catch (e: any) { toast.error(e.message); }
          finally { setBulkUpdating(false); }
        }}
        title="Archive Selected Loads"
        description={`Archive ${selectedIds.size} load(s)? They can be restored from the Archive page.`}
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

      {/* Add/Edit Load Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingLoad ? `Edit load ${editingLoad.landstar_load_id || ''}`.trim() : 'Add a load'}</DialogTitle>
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
                const structuredStops = (data.intermediate_stops || []).map((s: any, i: number) => ({
                  stop_number: i + 1,
                  stop_type: 'intermediate',
                  facility_name: s.facility_name,
                  address: s.address,
                  date: s.date,
                }));
                createMutation.mutate({ load: { ...payload, ...calculated }, accessorials: [], intermediateStops: structuredStops });
              }}
              onCancel={closeDialog}
            />
          ) : (
          <form onSubmit={handleSubmit}>
            {(() => {
              const editing = !!editingLoad?.id;
              const revenuePreview = calculateRevenueLocal(formData);
              const pickupType = (formData as any).pickup_time_type || 'appointment';
              const deliveryType = (formData as any).delivery_time_type || 'appointment';
              const timeLabel = (type: string) => (type === 'appointment' ? 'Appointment time' : type === 'fcfs' ? 'Opens at' : 'Window opens');
              const milesForPreview = (Number(formData.actual_miles) > 0 ? Number(formData.actual_miles) : Number(formData.booked_miles)) || 0;
              const dims = calcOverDimensionCharge({
                height_inches: formData.height_inches,
                width_inches: formData.width_inches,
                length_inches: formData.length_inches,
                miles: milesForPreview,
                rules: overDimRules as OverDimRule[],
              });
              const anyDim = !!(formData.height_inches || formData.width_inches || formData.length_inches);
              const { rate: detentionRate, cap: detentionCap } = getDetentionRuleForLoad(formData);
              const detentionTrailer = trailers.find((t: any) => t.id === formData?.trailer_id);
              const set = (patch: Record<string, any>) => setFormData({ ...formData, ...patch });
              const appointmentOptions = (
                <SelectContent>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="fcfs">First come, first served</SelectItem>
                  <SelectItem value="window">Open window</SelectItem>
                </SelectContent>
              );

              return (
                <Tabs defaultValue="trip" className="w-full">
                  <div className="-mx-1 overflow-x-auto px-1 pb-1">
                    <TabsList className="inline-flex h-11 w-max min-w-full justify-start">
                      <TabsTrigger value="trip" className="h-9">Trip</TabsTrigger>
                      <TabsTrigger value="money" className="h-9">Money</TabsTrigger>
                      <TabsTrigger value="more" className="h-9">More</TabsTrigger>
                      {editing && <TabsTrigger value="expenses" className="h-9">Expenses</TabsTrigger>}
                      {editing && <TabsTrigger value="pod" className="h-9">Proof of delivery</TabsTrigger>}
                      {editing && <TabsTrigger value="history" className="h-9">History</TabsTrigger>}
                    </TabsList>
                  </div>

                  {/* TRIP: which load, where it goes, when, and who is driving */}
                  <TabsContent value="trip" className="mt-4 space-y-6">
                    <FormSection title="The load">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label={isLandstar ? 'Landstar load ID' : 'Load ID'} htmlFor="landstar_load_id">
                          <Input id="landstar_load_id" value={formData.landstar_load_id || ''} onChange={(e) => set({ landstar_load_id: e.target.value })} placeholder="8941232" />
                        </Field>
                        <Field label="Agent code" htmlFor="agency_code">
                          <Input
                            id="agency_code"
                            value={formData.agency_code || ''}
                            onChange={(e) => set({ agency_code: e.target.value.toUpperCase().slice(0, 3) })}
                            placeholder="JNS"
                            maxLength={3}
                            className="font-mono"
                          />
                          <AgencyCRMStatusBadge agencyCode={formData.agency_code} onBlockedChange={setAgencyBlocked} />
                        </Field>
                        <Field label="Status" htmlFor="status">
                          <Select value={formData.status || 'pending'} onValueChange={(v) => set({ status: v })}>
                            <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="assigned">Assigned</SelectItem>
                              <SelectItem value="at_pickup">At pickup</SelectItem>
                              <SelectItem value="loading">Loading</SelectItem>
                              <SelectItem value="in_transit">In transit</SelectItem>
                              <SelectItem value="at_delivery">At delivery</SelectItem>
                              <SelectItem value="unloading">Unloading</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                    </FormSection>

                    <FormSection title="Pickup">
                      <div className="grid gap-4">
                        <Field label="Pickup address" htmlFor="origin">
                          <Input id="origin" value={formData.origin || ''} onChange={(e) => set({ origin: e.target.value })} placeholder="1234 Industrial Blvd, Lewisville, TX 75057" required />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-4">
                          <Field label="Date" htmlFor="pickup_date">
                            <Input id="pickup_date" type="date" value={formData.pickup_date || ''} onChange={(e) => set({ pickup_date: e.target.value })} />
                          </Field>
                          <Field label="Time rule" htmlFor="pickup_time_type">
                            <Select value={pickupType} onValueChange={(v) => set({ pickup_time_type: v, ...(v !== 'window' ? { pickup_end_time: null } : {}) })}>
                              <SelectTrigger id="pickup_time_type"><SelectValue /></SelectTrigger>
                              {appointmentOptions}
                            </Select>
                          </Field>
                          <Field label={timeLabel(pickupType)} htmlFor="pickup_time">
                            <Input id="pickup_time" value={formData.pickup_time || ''} onChange={(e) => set({ pickup_time: e.target.value })} placeholder="8:00 AM" />
                          </Field>
                          {pickupType === 'window' && (
                            <Field label="Window closes" htmlFor="pickup_end_time">
                              <Input id="pickup_end_time" value={(formData as any).pickup_end_time || ''} onChange={(e) => set({ pickup_end_time: e.target.value })} placeholder="5:00 PM" />
                            </Field>
                          )}
                        </div>
                        <Field label="Pickup number" htmlFor="pickup_number" hint="Shown to the driver at the guard shack.">
                          <Input id="pickup_number" value={formData.pickup_number || ''} onChange={(e) => set({ pickup_number: e.target.value })} placeholder="PU-48291" />
                        </Field>
                      </div>
                    </FormSection>

                    <FormSection title="Delivery">
                      <div className="grid gap-4">
                        <Field label="Delivery address" htmlFor="destination">
                          <Input id="destination" value={formData.destination || ''} onChange={(e) => set({ destination: e.target.value })} placeholder="5678 Commerce Dr, Evans, CO 80620" required />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-4">
                          <Field label="Date" htmlFor="delivery_date">
                            <Input id="delivery_date" type="date" value={formData.delivery_date || ''} onChange={(e) => set({ delivery_date: e.target.value })} />
                          </Field>
                          <Field label="Time rule" htmlFor="delivery_time_type">
                            <Select value={deliveryType} onValueChange={(v) => set({ delivery_time_type: v, ...(v !== 'window' ? { delivery_end_time: null } : {}) })}>
                              <SelectTrigger id="delivery_time_type"><SelectValue /></SelectTrigger>
                              {appointmentOptions}
                            </Select>
                          </Field>
                          <Field label={timeLabel(deliveryType)} htmlFor="delivery_time">
                            <Input id="delivery_time" value={formData.delivery_time || ''} onChange={(e) => set({ delivery_time: e.target.value })} placeholder="2:00 PM" />
                          </Field>
                          {deliveryType === 'window' && (
                            <Field label="Window closes" htmlFor="delivery_end_time">
                              <Input id="delivery_end_time" value={(formData as any).delivery_end_time || ''} onChange={(e) => set({ delivery_end_time: e.target.value })} placeholder="6:00 PM" />
                            </Field>
                          )}
                        </div>
                      </div>
                    </FormSection>

                    <FormSection title="Who is hauling it">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Driver" htmlFor="driver_id">
                          <Select value={formData.driver_id || 'none'} onValueChange={(v) => set({ driver_id: v === 'none' ? null : v })}>
                            <SelectTrigger id="driver_id"><SelectValue placeholder="Select driver" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {drivers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Truck" htmlFor="truck_id">
                          <Select value={formData.truck_id || 'none'} onValueChange={(v) => set({ truck_id: v === 'none' ? null : v })}>
                            <SelectTrigger id="truck_id"><SelectValue placeholder="Select truck" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {trucks.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.unit_number}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Trailer" htmlFor="trailer_id">
                          <Select value={formData.trailer_id || 'none'} onValueChange={(v) => set({ trailer_id: v === 'none' ? null : v })}>
                            <SelectTrigger id="trailer_id"><SelectValue placeholder="Select trailer" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {trailers.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.unit_number}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                    </FormSection>
                  </TabsContent>

                  {/* MONEY: what the customer pays, and what that comes to for you */}
                  <TabsContent value="money" className="mt-4 space-y-6">
                    <FormSection title="What the load pays">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Linehaul" htmlFor="rate">
                          <CurrencyInput id="rate" value={formData.rate ?? ''} onChange={(v) => set({ rate: v === '' ? 0 : parseFloat(v) })} placeholder="0.00" />
                        </Field>
                        <Field label="Fuel surcharge" htmlFor="fuel_surcharge">
                          <CurrencyInput id="fuel_surcharge" value={formData.fuel_surcharge ?? ''} onChange={(v) => set({ fuel_surcharge: v === '' ? 0 : parseFloat(v) })} placeholder="0.00" />
                        </Field>
                        <Field label="Booked miles" htmlFor="booked_miles">
                          <IntegerInput id="booked_miles" value={formData.booked_miles ?? ''} onChange={(v) => set({ booked_miles: v === '' ? 0 : parseInt(v, 10) })} placeholder="0" />
                        </Field>
                        <Field label="Lumper" htmlFor="lumper">
                          <CurrencyInput id="lumper" value={formData.lumper ?? ''} onChange={(v) => set({ lumper: v === '' ? 0 : parseFloat(v) })} placeholder="0.00" />
                        </Field>
                        <Field
                          label="Detention hours"
                          htmlFor="detention_hours"
                          hint={detentionTrailer?.trailer_type ? `$${detentionRate.toFixed(2)} an hour, capped at $${detentionCap.toFixed(2)} a day (${detentionTrailer.trailer_type})` : 'Pick a trailer to fill in the rate.'}
                        >
                          <Input
                            id="detention_hours"
                            type="number"
                            min={0}
                            step="0.25"
                            value={formData.detention_hours ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const h = v === '' ? 0 : parseFloat(v);
                              const days = h > 0 ? Math.ceil(h / 24) : 0;
                              const owed = detentionCap > 0 ? Math.min(h * detentionRate, detentionCap * days) : h * detentionRate;
                              set({ detention_hours: v === '' ? null : h, detention_pay: +owed.toFixed(2) });
                            }}
                            placeholder="0"
                          />
                        </Field>
                        <Field label="Detention pay" htmlFor="detention_pay" hint="Worked out from the hours; change it if the paperwork says otherwise.">
                          <CurrencyInput id="detention_pay" value={formData.detention_pay ?? ''} onChange={(v) => set({ detention_pay: v === '' ? 0 : parseFloat(v) })} placeholder="0.00" />
                        </Field>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <Checkbox id="is_power_only" checked={formData.is_power_only || false} onCheckedChange={(checked) => set({ is_power_only: checked })} />
                        <Label htmlFor="is_power_only" className="cursor-pointer font-normal">Power only: {getSetting('power_only_percentage', '70')}% to the truck, no trailer share</Label>
                      </div>
                    </FormSection>

                    <FormSection
                      title="Extra charges"
                      description="Stop-offs, layover, just in time and the like. Landstar sets how much of each it pays you."
                      aside={<Button type="button" variant="outline" className="h-11" onClick={addAccessorial}><Plus className="mr-1 h-4 w-4" /> Add charge</Button>}
                    >
                      {accessorials.length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">No extra charges on this load.</p>
                      ) : (
                        <div className="space-y-3">
                          {accessorials.map((acc, index) => (
                            <div key={index} className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto] sm:items-end">
                              <Field label="Charge">
                                <Select
                                  value={acc.accessorial_type}
                                  onValueChange={(v) => {
                                    const match = accessorialTypes.find((t: any) => t.name === v);
                                    const updated = [...accessorials];
                                    updated[index] = { ...updated[index], accessorial_type: v, is_driver_pay: match ? !!match.default_is_driver_pay : updated[index].is_driver_pay };
                                    setAccessorials(updated);
                                  }}
                                >
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {acc.accessorial_type && !accessorialTypes.some((t: any) => t.name === acc.accessorial_type) && (
                                      <SelectItem value={acc.accessorial_type}>{acc.accessorial_type} (legacy)</SelectItem>
                                    )}
                                    {accessorialTypes.map((t: any) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field label="Paid to">
                                <Select value={acc.is_driver_pay ? 'driver' : 'company'} onValueChange={(v) => updateAccessorial(index, 'is_driver_pay', v === 'driver')}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="driver">Driver</SelectItem>
                                    <SelectItem value="company">Company</SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field label="Amount">
                                <CurrencyInput value={acc.amount ?? ''} onChange={(v) => updateAccessorial(index, 'amount', v === '' ? 0 : parseFloat(v))} placeholder="0.00" />
                              </Field>
                              <Field label="% paid">
                                <PercentageInput value={acc.percentage ?? ''} onChange={(v) => updateAccessorial(index, 'percentage', v === '' ? 100 : parseFloat(v))} placeholder="100" />
                              </Field>
                              <div className="flex items-center justify-between gap-2 sm:justify-end">
                                <span className="text-sm text-muted-foreground sm:hidden">
                                  {acc.is_driver_pay ? `You get ${formatCurrency(acc.amount * (acc.percentage / 100))}` : 'Company expense'}
                                </span>
                                <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label="Remove this charge" onClick={() => removeAccessorial(index)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <p className="text-right text-sm text-muted-foreground">
                            Total extra charges <span className="figure font-semibold text-foreground">{formatCurrency(calculateAccessorialsTotal())}</span>
                            {' · '}to the driver{' '}
                            <span className="figure font-semibold text-foreground">
                              {formatCurrency(accessorials.filter((a) => a.is_driver_pay).reduce((s, a) => s + (Number(a.amount) || 0) * ((Number(a.percentage) || 0) / 100), 0))}
                            </span>
                          </p>
                        </div>
                      )}
                    </FormSection>

                    {isIndependent && (
                      <FormSection title="Negotiation">
                        <div className="mb-4 flex items-baseline justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                          <div>
                            <div className="text-sm font-medium">Total negotiated rate</div>
                            <div className="text-xs text-muted-foreground">Linehaul, fuel surcharge, extra charges and lumper</div>
                          </div>
                          <span className="figure text-xl font-bold text-primary">
                            {formatCurrency((parseFloat(formData.rate) || 0) + (parseFloat(formData.fuel_surcharge) || 0) + calculateAccessorialsTotal() + (parseFloat(formData.lumper) || 0))}
                          </span>
                        </div>
                        <Field label="Notes" htmlFor="negotiation_notes">
                          <Textarea id="negotiation_notes" value={formData.negotiation_notes || ''} onChange={(e) => set({ negotiation_notes: e.target.value })} placeholder="Counter-offers, what the broker agreed to" rows={3} />
                        </Field>
                        {formData.agency_code && <div className="mt-4"><BrokerRateHistoryCard agencyCode={formData.agency_code} currentLoads={loads} /></div>}
                      </FormSection>
                    )}

                    <FormSection title="Advance">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Advance taken" htmlFor="advance_taken">
                          <CurrencyInput id="advance_taken" value={formData.advance_taken ?? ''} onChange={(v) => set({ advance_taken: v === '' ? 0 : parseFloat(v) })} placeholder="0.00" />
                        </Field>
                        <Field label="Advance available" hint={`Fuel surcharge plus ${getSetting('advance_percentage', '30')}% of linehaul`}>
                          <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-muted-foreground figure">
                            {formatCurrency((parseFloat(formData.fuel_surcharge) || 0) + ((parseFloat(formData.rate) || 0) * (parseFloat(getSetting('advance_percentage', '30')) / 100)))}
                          </div>
                        </Field>
                      </div>
                    </FormSection>

                    <Panel title="What this comes to" description="Worked out from the figures above, using your pay settings.">
                      <StatementLine label="Billed in all" note="Linehaul, fuel surcharge and extra charges" value={formatCurrency(revenuePreview.gross_revenue)} />
                      <StatementLine label={`Truck share (${formData.is_power_only ? getSetting('power_only_percentage', '70') : getSetting('truck_percentage', '65')}%)`} value={formatCurrency(revenuePreview.truck_revenue)} rule="single" />
                      <StatementLine label={`Trailer share (${getSetting('trailer_percentage', '7')}%)`} value={formatCurrency(revenuePreview.trailer_revenue)} rule="single" />
                      <StatementLine label="Your revenue" value={formatCurrency(revenuePreview.net_revenue)} strong rule="double" />
                    </Panel>
                  </TabsContent>

                  {/* MORE: customs, freight size, miles, notices and notes */}
                  <TabsContent value="more" className="mt-4 space-y-6">
                    <FormSection title="Miles">
                      <div className="grid gap-4 sm:grid-cols-4">
                        <Field label="Starting odometer" htmlFor="start_miles">
                          <IntegerInput id="start_miles" value={formData.start_miles ?? ''} onChange={(v) => set({ start_miles: v === '' ? 0 : parseInt(v, 10) })} placeholder="0" />
                        </Field>
                        <Field label="Ending odometer" htmlFor="end_miles">
                          <IntegerInput id="end_miles" value={formData.end_miles ?? ''} onChange={(v) => set({ end_miles: v === '' ? 0 : parseInt(v, 10) })} placeholder="0" />
                        </Field>
                        <Field label="Miles driven" hint="Ending minus starting">
                          <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-muted-foreground figure">
                            {((parseInt(formData.end_miles) || 0) - (parseInt(formData.start_miles) || 0)).toLocaleString()}
                          </div>
                        </Field>
                        <Field label="Empty miles" htmlFor="empty_miles" hint="Deadhead to the pickup">
                          <IntegerInput id="empty_miles" value={formData.empty_miles ?? ''} onChange={(v) => set({ empty_miles: v === '' ? 0 : parseInt(v, 10) })} placeholder="0" />
                        </Field>
                      </div>
                    </FormSection>

                    <FormSection
                      title="Freight size"
                      description={`Legal is 13'6" high, 8'6" wide and 70' long. Over that, Landstar's over-dimension charge is added for you.`}
                      aside={
                        anyDim ? (
                          dims.charge_amount > 0 ? (
                            <span className="rounded-md bg-warning/15 px-2 py-1 text-xs font-medium text-warning" title={dims.breakdown.map((b) => `${b.dimension}: $${b.cpm.toFixed(2)}/mi`).join(' · ')}>
                              Over-dimension: ${dims.charge_amount.toFixed(2)} on {milesForPreview} miles
                            </span>
                          ) : (
                            <span className="rounded-md bg-success/15 px-2 py-1 text-xs font-medium text-success">Legal size</span>
                          )
                        ) : undefined
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Height" htmlFor="height_inches"><FeetInchesInput id="height_inches" valueInches={formData.height_inches} onChange={(v) => set({ height_inches: v })} /></Field>
                        <Field label="Width" htmlFor="width_inches"><FeetInchesInput id="width_inches" valueInches={formData.width_inches} onChange={(v) => set({ width_inches: v })} /></Field>
                        <Field label="Length" htmlFor="length_inches"><FeetInchesInput id="length_inches" valueInches={formData.length_inches} onChange={(v) => set({ length_inches: v })} /></Field>
                      </div>
                      {dims.charge_amount > 0 && (
                        <p className="mt-3 text-xs text-muted-foreground">A company charge of ${dims.charge_amount.toFixed(2)} (Rule 670) is added when you save. It is not paid to the driver.</p>
                      )}
                    </FormSection>

                    <FormSection title="Customs">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="is_in_bond"
                          className="mt-1"
                          checked={!!formData.is_in_bond}
                          onCheckedChange={(checked) => setFormData((prev: any) => ({ ...prev, is_in_bond: !!checked, cf_7512_number: checked ? prev.cf_7512_number ?? '' : null }))}
                        />
                        <div>
                          <Label htmlFor="is_in_bond" className="cursor-pointer font-medium">In-bond or international shipment (Rule 480)</Label>
                          <p className="text-xs text-muted-foreground">
                            Adds a company charge of ${parseFloat(getSetting('in_bond_fee', '100')).toFixed(2)} and tells the driver not to break the customs seal.
                          </p>
                        </div>
                      </div>
                      {formData.is_in_bond && (
                        <div className="mt-3 sm:max-w-sm sm:pl-7">
                          <Field label="CF 7512 number" htmlFor="cf_7512_number">
                            <Input id="cf_7512_number" value={formData.cf_7512_number ?? ''} onChange={(e) => set({ cf_7512_number: e.target.value })} placeholder="123-45678901" maxLength={64} required className="font-mono" />
                          </Field>
                        </div>
                      )}
                    </FormSection>

                    <FormSection title="Notices">
                      <div className="divide-y rounded-lg border">
                        <div className="flex items-center justify-between gap-4 px-4 py-3">
                          <div>
                            <Label htmlFor="auto_email_updates" className="cursor-pointer font-medium">Email the agent when the status changes</Label>
                            <p className="text-xs text-muted-foreground">Sends an update each time this load moves.</p>
                          </div>
                          <Switch id="auto_email_updates" checked={formData.auto_email_updates ?? true} onCheckedChange={(checked) => set({ auto_email_updates: checked })} />
                        </div>
                        <div className="flex items-center justify-between gap-4 px-4 py-3">
                          <div>
                            <Label htmlFor="pod_required" className="cursor-pointer font-medium">Require proof of delivery</Label>
                            <p className="text-xs text-muted-foreground">The driver must add the Transflo link and signature on delivery.</p>
                          </div>
                          <Switch id="pod_required" checked={formData.pod_required ?? true} onCheckedChange={(checked) => set({ pod_required: checked })} />
                        </div>
                      </div>
                    </FormSection>

                    <FormSection title="Notes">
                      <Textarea id="notes" aria-label="Notes" value={formData.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything the next person should know" rows={4} />
                    </FormSection>
                  </TabsContent>

                  {editing && (
                    <TabsContent value="expenses" className="mt-4">
                      <ExpensesList relatedType="load" relatedId={editingLoad.id} title="Load expenses" />
                    </TabsContent>
                  )}
                  {editing && (
                    <TabsContent value="pod" className="mt-4">
                      <PODViewer podSignaturePath={editingLoad?.pod_signature_path} podTransfloLink={editingLoad?.pod_transflo_link} />
                    </TabsContent>
                  )}
                  {editing && (
                    <TabsContent value="history" className="mt-4">
                      <div className="space-y-4">
                        <IntermediateStopsView loadId={editingLoad.id} />
                        <StatusHistoryLog
                          loadId={editingLoad.id}
                          pickupDate={editingLoad.pickup_date}
                          pickupTime={editingLoad.pickup_time}
                          deliveryDate={editingLoad.delivery_date}
                          deliveryTime={editingLoad.delivery_time}
                        />
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              );
            })()}

            <DialogFooter className="sticky -bottom-4 z-10 -mx-4 mt-6 flex-row justify-end gap-2 border-t bg-background px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:space-x-0 sm:px-6">
              <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none text-primary-foreground" disabled={agencyBlocked}>
                {editingLoad ? 'Save changes' : 'Add load'}
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
