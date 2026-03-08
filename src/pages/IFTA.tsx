import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Plus, Download, Fuel, Route, DollarSign, Calculator, Pencil, Trash2, MapPin, Link2, Loader2, Sparkles, RefreshCw, TrendingDown, RotateCcw, Printer, AlertTriangle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';
import { US_STATES } from '@/lib/us-states';
import { extractJurisdictionFromVendor } from '@/lib/us-states';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { STATE_DIESEL_TAX_RATES } from '@/lib/ifta-tax-rates';
import { JurisdictionMap } from '@/components/ifta/JurisdictionMap';
import { UnsyncedExpenses } from '@/components/ifta/UnsyncedExpenses';
import { IFTAWorkflowStepper } from '@/components/ifta/IFTAWorkflowStepper';
import { IFTATooltip } from '@/components/ifta/IFTATooltip';
import { IFTAPrintSummary } from '@/components/ifta/IFTAPrintSummary';
import { ResetQuarterDialog } from '@/components/ifta/ResetQuarterDialog';
import { analyzeLoadRoute } from '@/lib/ifta-route-analysis';
import { cn } from '@/lib/utils';

interface IFTARecord {
  id: string;
  quarter: string;
  jurisdiction: string;
  total_miles: number;
  taxable_miles: number;
  fuel_gallons: number;
  fuel_cost: number;
  tax_rate: number;
  tax_owed: number;
  truck_id: string | null;
  created_at: string;
}

interface FuelPurchase {
  id: string;
  purchase_date: string;
  truck_id: string | null;
  driver_id: string | null;
  jurisdiction: string;
  gallons: number;
  price_per_gallon: number;
  total_cost: number;
  vendor: string | null;
  receipt_url: string | null;
  source_expense_id: string | null;
  created_at: string;
}

// US_STATES is now imported from @/lib/us-states

const QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4', '2025-Q4', '2025-Q3'];

export default function IFTA() {
  const queryClient = useQueryClient();
  const [selectedQuarter, setSelectedQuarter] = useState('2026-Q1');
  const [selectedTruck, setSelectedTruck] = useState<string>('all');
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false);
  const [editingFuel, setEditingFuel] = useState<FuelPurchase | null>(null);
  const [fuelFormData, setFuelFormData] = useState<Partial<FuelPurchase>>({});
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [printSummaryOpen, setPrintSummaryOpen] = useState(false);
  const [auditAlerts, setAuditAlerts] = useState<{ id: string; type: string; message: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('id, unit_number');
      if (error) throw error;
      return data;
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


  const { data: fuelPurchases = [], isLoading: fuelLoading } = useQuery({
    queryKey: ['fuel_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_purchases')
        .select('*')
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as FuelPurchase[];
    },
  });

  const { data: iftaRecords = [] } = useQuery({
    queryKey: ['ifta_records', selectedQuarter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ifta_records')
        .select('*')
        .eq('quarter', selectedQuarter)
        .order('jurisdiction');
      if (error) throw error;
      return data as IFTARecord[];
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Query for unsynced fuel/DEF/Fuel Discount expenses (no matching fuel_purchases record)
  const { data: unsyncedExpenses = [] } = useQuery({
    queryKey: ['unsynced_fuel_expenses', selectedQuarter],
    queryFn: async () => {
      const [year, q] = selectedQuarter.split('-');
      const quarter = parseInt(q.replace('Q', ''));
      const startMonth = (quarter - 1) * 3;
      const endMonth = startMonth + 3;
      const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
      const endDate = quarter === 4
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(endMonth + 1).padStart(2, '0')}-01`;

      // Get all fuel/DEF/Fuel Discount expenses for the quarter
      const { data: fuelExpenses, error: expError } = await supabase
        .from('expenses')
        .select('id, expense_date, expense_type, vendor, description, amount, gallons, truck_id, jurisdiction')
        .in('expense_type', ['Fuel', 'DEF', 'Fuel Discount'])
        .gte('expense_date', startDate)
        .lt('expense_date', endDate);

      if (expError) throw expError;
      if (!fuelExpenses || fuelExpenses.length === 0) return [];

      // Find which ones already have a fuel_purchases record
      const expenseIds = fuelExpenses.map(e => e.id);
      const { data: synced } = await supabase
        .from('fuel_purchases')
        .select('source_expense_id')
        .in('source_expense_id', expenseIds);

      const syncedSet = new Set((synced || []).map(r => r.source_expense_id));

      // Return only unsynced expenses that have no jurisdiction
      return fuelExpenses.filter(e => !syncedSet.has(e.id) && !e.jurisdiction);
    },
  });

  const createFuelMutation = useMutation({
    mutationFn: async (purchase: Partial<FuelPurchase>) => {
      const { error } = await supabase.from('fuel_purchases').insert(purchase as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      toast.success('Fuel purchase added');
      closeFuelDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateFuelMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FuelPurchase> & { id: string }) => {
      const { error } = await supabase.from('fuel_purchases').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      toast.success('Fuel purchase updated');
      closeFuelDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteFuelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fuel_purchases').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      toast.success('Fuel purchase deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openFuelDialog = (purchase?: FuelPurchase) => {
    setEditingFuel(purchase || null);
    setFuelFormData(purchase || { 
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      gallons: 0,
      price_per_gallon: 0,
      total_cost: 0,
    });
    setFuelDialogOpen(true);
  };

  const closeFuelDialog = () => {
    setFuelDialogOpen(false);
    setEditingFuel(null);
    setFuelFormData({});
  };

  const handleFuelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fuelFormData.jurisdiction || !fuelFormData.gallons) {
      toast.error('State and gallons are required');
      return;
    }
    if (editingFuel) {
      updateFuelMutation.mutate({ id: editingFuel.id, ...fuelFormData });
    } else {
      createFuelMutation.mutate(fuelFormData);
    }
  };

  const getTruckName = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find(t => t.id === truckId);
    return truck ? `#${truck.unit_number}` : '-';
  };


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  // Filter fuel purchases by quarter
  const filteredFuelPurchases = fuelPurchases.filter(fp => {
    if (selectedTruck !== 'all' && fp.truck_id !== selectedTruck) return false;
    // Simple quarter filtering based on purchase_date
    const date = parseISO(fp.purchase_date);
    const [year, q] = selectedQuarter.split('-');
    const quarter = parseInt(q.replace('Q', ''));
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 3;
    return date.getFullYear() === parseInt(year) && 
           date.getMonth() >= startMonth && 
           date.getMonth() < endMonth;
  });

  // Calculate summary stats
  const grossFuelCost = filteredFuelPurchases
    .filter(p => p.total_cost > 0)
    .reduce((s, p) => s + p.total_cost, 0);
  const discountTotal = filteredFuelPurchases
    .filter(p => p.total_cost < 0)
    .reduce((s, p) => s + Math.abs(p.total_cost), 0);
  const discountCount = filteredFuelPurchases.filter(p => p.total_cost < 0).length;

  const summary = {
    totalMiles: iftaRecords.reduce((s, r) => s + r.total_miles, 0),
    totalGallons: filteredFuelPurchases.reduce((s, p) => s + p.gallons, 0),
    totalFuelCost: filteredFuelPurchases.reduce((s, p) => s + p.total_cost, 0),
    taxOwed: iftaRecords.reduce((s, r) => s + r.tax_owed, 0),
  };

  const avgMpg = summary.totalGallons > 0 ? summary.totalMiles / summary.totalGallons : 0;

  // Count unique states in jurisdiction summary
  const jurisdictionStates = new Set([
    ...iftaRecords.map(r => r.jurisdiction),
    ...filteredFuelPurchases.map(fp => fp.jurisdiction),
  ]);

  // Count delivered loads for the quarter (for empty state)
  const quarterDeliveredLoads = loads.filter(l => {
    if (l.status !== 'delivered' || !l.delivery_date) return false;
    const date = parseISO(l.delivery_date);
    const [year, q] = selectedQuarter.split('-');
    const quarter = parseInt(q.replace('Q', ''));
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 3;
    return date.getFullYear() === parseInt(year) &&
           date.getMonth() >= startMonth &&
           date.getMonth() < endMonth;
  });

  // --- Auto-generate IFTA records from delivered loads ---
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [autoGenProgress, setAutoGenProgress] = useState({ current: 0, total: 0, message: '' });
  const [isSyncing, setIsSyncing] = useState(false);

  // --- Sync Fuel Purchases from Expenses ---
  const syncFuelFromExpenses = async () => {
    setIsSyncing(true);
    try {
      const [year, q] = selectedQuarter.split('-');
      const quarter = parseInt(q.replace('Q', ''));
      const startMonth = (quarter - 1) * 3;
      const endMonth = startMonth + 3;
      const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
      const endDate = quarter === 4
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(endMonth + 1).padStart(2, '0')}-01`;

      const { data: fuelExpenses, error: expError } = await supabase
        .from('expenses')
        .select('id, vendor, description, jurisdiction, load_id, amount, gallons, expense_date, truck_id, expense_type')
        .in('expense_type', ['Fuel', 'DEF', 'Fuel Discount'])
        .gte('expense_date', startDate)
        .lt('expense_date', endDate);

      if (expError) throw expError;
      if (!fuelExpenses || fuelExpenses.length === 0) {
        toast.info('No Fuel/DEF/Discount expenses found for this quarter');
        setIsSyncing(false);
        return;
      }

      const expenseIds = fuelExpenses.map(e => e.id);
      const { data: existingSynced } = await supabase
        .from('fuel_purchases')
        .select('source_expense_id')
        .in('source_expense_id', expenseIds);

      const syncedIds = new Set((existingSynced || []).map(r => r.source_expense_id));
      const unsyncedExpenses = fuelExpenses.filter(e => !syncedIds.has(e.id));

      if (unsyncedExpenses.length === 0) {
        toast.info('All fuel expenses are already synced');
        setIsSyncing(false);
        return;
      }

      let syncedCount = 0;
      let skippedCount = 0;

      for (const expense of unsyncedExpenses) {
        let jurisdiction = expense.jurisdiction;

        // For Fuel Discount / NATS, try parsing the description first
        if (!jurisdiction && expense.expense_type === 'Fuel Discount') {
          jurisdiction = extractStateFromDescription(expense.description);
        }

        if (!jurisdiction) {
          jurisdiction = extractJurisdictionFromVendor(expense.vendor);
        }

        // Also try the description for regular fuel expenses
        if (!jurisdiction) {
          jurisdiction = extractStateFromDescription(expense.description);
        }

        if (!jurisdiction && expense.load_id) {
          const { data: load } = await supabase
            .from('fleet_loads')
            .select('origin, destination')
            .eq('id', expense.load_id)
            .single();

          if (load) {
            jurisdiction = extractState(load.origin) || extractState(load.destination);
          }
        }

        if (!jurisdiction) {
          skippedCount++;
          continue;
        }

        const { error: updateError } = await supabase
          .from('expenses')
          .update({ jurisdiction })
          .eq('id', expense.id);

        if (updateError) {
          console.error(`Failed to update expense ${expense.id}:`, updateError);
          skippedCount++;
        } else {
          syncedCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      
      if (syncedCount > 0) {
        toast.success(`Synced ${syncedCount} of ${unsyncedExpenses.length} fuel expenses`);
      }
      if (skippedCount > 0) {
        toast.warning(`${skippedCount} expenses skipped (no jurisdiction found)`);
      }
    } catch (error: any) {
      console.error('Fuel sync error:', error);
      toast.error('Failed to sync: ' + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Extract a US state abbreviation from a NATS-style description or generic description.
   * E.g. "NATS Discount: OH765 PERRYSBURG OH" → "OH"
   */
  const extractStateFromDescription = (description: string | null): string | null => {
    if (!description) return null;
    const upper = description.toUpperCase().trim();
    // Try the last two-letter token as a state code
    const tokens = upper.split(/\s+/);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i].replace(/[^A-Z]/g, '');
      if (token.length === 2 && (US_STATES as readonly string[]).includes(token)) {
        return token;
      }
    }
    return null;
  };

  // Extract US state abbreviation from an address string
  const extractState = (address: string): string | null => {
    if (!address) return null;
    const parts = address.split(',').map(p => p.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      const match = parts[i].match(/\b([A-Z]{2})\b/);
      if (match && (US_STATES as readonly string[]).includes(match[1])) {
        return match[1];
      }
    }
    return null;
  };

  const autoGenerateIFTA = async () => {
    setIsAutoGenerating(true);
    setAutoGenProgress({ current: 0, total: 0, message: 'Fetching loads...' });
    try {
      const [year, q] = selectedQuarter.split('-');
      const quarter = parseInt(q.replace('Q', ''));
      const startMonth = (quarter - 1) * 3;
      const endMonth = startMonth + 3;
      const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
      const endDate = quarter === 4
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(endMonth + 1).padStart(2, '0')}-01`;

      // Fetch delivered loads in this quarter
      const { data: quarterLoads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('id, origin, destination, booked_miles, actual_miles, empty_miles, truck_id, delivery_date, notes')
        .eq('status', 'delivered')
        .gte('delivery_date', startDate)
        .lt('delivery_date', endDate);

      if (loadsError) throw loadsError;
      if (!quarterLoads || quarterLoads.length === 0) {
        toast.error('No delivered loads found for this quarter');
        setIsAutoGenerating(false);
        return;
      }

      setAutoGenProgress({ current: 0, total: quarterLoads.length, message: 'Analyzing routes...' });

      // Aggregate miles by state using route analysis
      const milesByState: Record<string, { totalMiles: number; truckIds: Set<string> }> = {};
      let routeAnalyzedCount = 0;
      let fallbackCount = 0;

      for (let i = 0; i < quarterLoads.length; i++) {
        const load = quarterLoads[i];
        const miles = load.actual_miles || load.booked_miles || 0;
        const emptyMiles = load.empty_miles || 0;
        const totalLoadMiles = miles + emptyMiles;

        if (totalLoadMiles <= 0) continue;

        setAutoGenProgress({
          current: i + 1,
          total: quarterLoads.length,
          message: `Analyzing load ${i + 1}/${quarterLoads.length}: ${load.origin.split(',')[0]} → ${load.destination.split(',')[0]}`,
        });

        // Try route-based analysis first
        let stateBreakdown: Record<string, number> | null = null;
        try {
          stateBreakdown = await analyzeLoadRoute(
            load.origin,
            load.destination,
            totalLoadMiles,
            load.notes,
          );
        } catch (err) {
          console.warn(`Route analysis failed for load ${load.id}, falling back`, err);
        }

        if (stateBreakdown && Object.keys(stateBreakdown).length > 0) {
          // Use route-based state breakdown
          routeAnalyzedCount++;
          for (const [state, stateMiles] of Object.entries(stateBreakdown)) {
            if (!milesByState[state]) milesByState[state] = { totalMiles: 0, truckIds: new Set() };
            milesByState[state].totalMiles += stateMiles;
            if (load.truck_id) milesByState[state].truckIds.add(load.truck_id);
          }
        } else {
          // Fallback: 50/50 split between origin and destination states
          fallbackCount++;
          const originState = extractState(load.origin);
          const destState = extractState(load.destination);

          if (!originState && !destState) continue;

          if (originState === destState && originState) {
            if (!milesByState[originState]) milesByState[originState] = { totalMiles: 0, truckIds: new Set() };
            milesByState[originState].totalMiles += totalLoadMiles;
            if (load.truck_id) milesByState[originState].truckIds.add(load.truck_id);
          } else {
            const halfMiles = totalLoadMiles / 2;
            if (originState) {
              if (!milesByState[originState]) milesByState[originState] = { totalMiles: 0, truckIds: new Set() };
              milesByState[originState].totalMiles += halfMiles;
              if (load.truck_id) milesByState[originState].truckIds.add(load.truck_id);
            }
            if (destState) {
              if (!milesByState[destState]) milesByState[destState] = { totalMiles: 0, truckIds: new Set() };
              milesByState[destState].totalMiles += halfMiles;
              if (load.truck_id) milesByState[destState].truckIds.add(load.truck_id);
            }
          }
        }

        // Brief delay between loads to respect API rate limits
        if (i < quarterLoads.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      setAutoGenProgress({ current: quarterLoads.length, total: quarterLoads.length, message: 'Computing tax liability...' });

      // Get fuel purchased by state for this quarter
      const fuelGallonsByState: Record<string, { gallons: number; cost: number }> = {};
      filteredFuelPurchases.forEach(fp => {
        if (!fuelGallonsByState[fp.jurisdiction]) {
          fuelGallonsByState[fp.jurisdiction] = { gallons: 0, cost: 0 };
        }
        fuelGallonsByState[fp.jurisdiction].gallons += fp.gallons;
        fuelGallonsByState[fp.jurisdiction].cost += fp.total_cost;
      });

      // Calculate fleet average MPG for IFTA tax computation
      const totalQuarterMiles = Object.values(milesByState).reduce((s, v) => s + v.totalMiles, 0);
      const totalQuarterGallons = filteredFuelPurchases.reduce((s, fp) => s + fp.gallons, 0);
      const fleetMpg = totalQuarterGallons > 0 ? totalQuarterMiles / totalQuarterGallons : 6.0;

      // Build IFTA records
      const iftaInserts = Object.entries(milesByState).map(([state, data]) => {
        const taxRate = STATE_DIESEL_TAX_RATES[state] || 0;
        const totalMiles = Math.round(data.totalMiles);
        const taxableMiles = totalMiles;
        const gallonsConsumed = totalMiles / fleetMpg;
        const fuelData = fuelGallonsByState[state] || { gallons: 0, cost: 0 };
        const taxOwed = (gallonsConsumed * taxRate) - (fuelData.gallons * taxRate);

        return {
          quarter: selectedQuarter,
          jurisdiction: state,
          total_miles: totalMiles,
          taxable_miles: taxableMiles,
          fuel_gallons: parseFloat(fuelData.gallons.toFixed(2)),
          fuel_cost: parseFloat(fuelData.cost.toFixed(2)),
          tax_rate: taxRate,
          tax_owed: parseFloat(taxOwed.toFixed(2)),
          truck_id: data.truckIds.size === 1 ? Array.from(data.truckIds)[0] : null,
        };
      });

      if (iftaInserts.length === 0) {
        toast.error('Could not extract state data from load addresses');
        setIsAutoGenerating(false);
        return;
      }

      // Delete existing records for this quarter then insert new ones
      await supabase.from('ifta_records').delete().eq('quarter', selectedQuarter);
      const { error: insertError } = await supabase.from('ifta_records').insert(iftaInserts);
      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey: ['ifta_records'] });
      const methodMsg = routeAnalyzedCount > 0
        ? `${routeAnalyzedCount} route-analyzed, ${fallbackCount} estimated`
        : `${fallbackCount} estimated`;
      toast.success(`Generated IFTA for ${iftaInserts.length} states from ${quarterLoads.length} loads (${methodMsg}, Fleet MPG: ${fleetMpg.toFixed(2)})`);
    } catch (error: any) {
      console.error('IFTA auto-generation error:', error);
      toast.error('Failed to generate IFTA records: ' + error.message);
    } finally {
      setIsAutoGenerating(false);
      setAutoGenProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Aggregate fuel by state for summary
  const fuelByState = filteredFuelPurchases.reduce((acc, fp) => {
    if (!acc[fp.jurisdiction]) {
      acc[fp.jurisdiction] = { gallons: 0, cost: 0 };
    }
    acc[fp.jurisdiction].gallons += fp.gallons;
    acc[fp.jurisdiction].cost += fp.total_cost;
    return acc;
  }, {} as Record<string, { gallons: number; cost: number }>);

  const exportToCSV = () => {
    const headers = ['State', 'Total Miles', 'Taxable Miles', 'Fuel Gallons', 'Fuel Cost', 'Tax Rate', 'Tax Owed'];
    const rows = iftaRecords.map(r => [
      r.jurisdiction,
      r.total_miles,
      r.taxable_miles,
      r.fuel_gallons.toFixed(2),
      r.fuel_cost.toFixed(2),
      r.tax_rate.toFixed(4),
      r.tax_owed.toFixed(2)
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IFTA_${selectedQuarter}.csv`;
    a.click();
    toast.success('IFTA report exported');
  };

  const handleResetQuarter = async (target: 'records' | 'fuel' | 'both') => {
    const [year, q] = selectedQuarter.split('-');
    const quarter = parseInt(q.replace('Q', ''));
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 3;
    const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
    const endDate = quarter === 4
      ? `${parseInt(year) + 1}-01-01`
      : `${year}-${String(endMonth + 1).padStart(2, '0')}-01`;

    try {
      if (target === 'records' || target === 'both') {
        const { error } = await supabase.from('ifta_records').delete().eq('quarter', selectedQuarter);
        if (error) throw error;
      }
      if (target === 'fuel' || target === 'both') {
        const { error } = await supabase
          .from('fuel_purchases')
          .delete()
          .gte('purchase_date', startDate)
          .lt('purchase_date', endDate);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['ifta_records'] });
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      queryClient.invalidateQueries({ queryKey: ['unsynced_fuel_expenses'] });
      const label = target === 'both' ? 'all data' : target === 'records' ? 'IFTA records' : 'fuel purchases';
      toast.success(`Reset ${label} for ${selectedQuarter}`);
    } catch (error: any) {
      toast.error('Reset failed: ' + error.message);
    }
  };

  // --- IFTA Audit Logic ---
  const runAudit = async () => {
    setAuditLoading(true);
    const alerts: { id: string; type: string; message: string }[] = [];

    for (const load of quarterDeliveredLoads) {
      // Check missing intermediate stops on long-haul loads
      if ((load.booked_miles || 0) > 500) {
        const hasStops = load.notes?.includes('=== INTERMEDIATE STOPS ===');
        if (!hasStops) {
          alerts.push({
            id: `stops-${load.id}`,
            type: 'Missing Stops',
            message: `Load ${load.origin} → ${load.destination} (${load.booked_miles}mi) has no intermediate stops recorded`,
          });
        }
      }

      // Check missing fuel purchases
      const hasFuel = filteredFuelPurchases.some(fp => {
        // Cross-reference by truck and date proximity
        if (!load.truck_id || fp.truck_id !== load.truck_id) return false;
        if (!load.delivery_date || !fp.purchase_date) return false;
        const loadDate = parseISO(load.delivery_date);
        const fuelDate = parseISO(fp.purchase_date);
        const diff = Math.abs(loadDate.getTime() - fuelDate.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      });
      if (!hasFuel && load.truck_id) {
        alerts.push({
          id: `fuel-${load.id}`,
          type: 'Missing Fuel',
          message: `No fuel purchase found near load ${load.origin} → ${load.destination} (delivered ${load.delivery_date})`,
        });
      }
    }

    setAuditAlerts(alerts);
    setAuditLoading(false);
    if (alerts.length === 0) {
      toast.success('Audit complete — no issues found');
    } else {
      toast.warning(`Audit found ${alerts.length} issue(s)`);
    }
  };

  return (
    <>
      <TooltipProvider>
      <PageHeader 
        title="IFTA Reporting" 
        description="Track fuel purchases and mileage by jurisdiction for quarterly IFTA tax filing"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select quarter" />
          </SelectTrigger>
          <SelectContent>
            {QUARTERS.map(q => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTruck} onValueChange={setSelectedTruck}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select truck" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trucks</SelectItem>
            {trucks.map(t => (
              <SelectItem key={t.id} value={t.id}>#{t.unit_number}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive hover:text-destructive"
          onClick={() => setResetDialogOpen(true)}
        >
          <RotateCcw className="h-4 w-4" />
          Reset Quarter
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Miles
              <IFTATooltip term="Total Miles" />
            </CardTitle>
            <Route className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalMiles.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">All jurisdictions</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Gallons
              <IFTATooltip term="Gal Purchased" />
            </CardTitle>
            <Fuel className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalGallons.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">
              Fleet MPG: {avgMpg > 0 ? avgMpg.toFixed(2) : '—'}
              <IFTATooltip term="Fleet MPG" />
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Net Fuel Cost
              <IFTATooltip term="Net Fuel Cost" />
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalFuelCost)}</div>
            {discountCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                <span className="text-destructive">{formatCurrency(grossFuelCost)}</span>
                {' gross · '}
                <span className="text-success">-{formatCurrency(discountTotal)}</span>
                {` (${discountCount} discount${discountCount !== 1 ? 's' : ''})`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No discounts applied</p>
            )}
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Tax Liability
              <IFTATooltip term="Tax Liability" />
            </CardTitle>
            <DollarSign className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.taxOwed >= 0 ? 'text-destructive' : 'text-success'}`}>
              {formatCurrency(Math.abs(summary.taxOwed))}
            </div>
            <p className="text-xs text-muted-foreground">{summary.taxOwed >= 0 ? 'Owed' : 'Credit'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Stepper */}
      <IFTAWorkflowStepper
        hasFuelPurchases={filteredFuelPurchases.length > 0}
        hasIFTARecords={iftaRecords.length > 0}
        hasJurisdictionData={jurisdictionStates.size > 0}
        onAuditData={runAudit}
        auditLoading={auditLoading}
      />

      {auditAlerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {auditAlerts.map(alert => (
            <Alert key={alert.id} variant="destructive" className="bg-destructive/5">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">{alert.type}</AlertTitle>
              <AlertDescription className="text-xs">{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Tabs defaultValue="fuel" className="w-full">
        <TabsList>
          <TabsTrigger value="fuel" className="gap-1.5">
            Fuel Purchases
            {filteredFuelPurchases.length > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                {filteredFuelPurchases.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5">
            Jurisdiction Summary
            {jurisdictionStates.size > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                {jurisdictionStates.size}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5">
            IFTA Report
            {iftaRecords.length > 0 && (
              <span className="h-2 w-2 rounded-full bg-success" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="mt-6">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Fuel Purchases</CardTitle>
                <CardDescription>Track all fuel purchases with jurisdiction</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={syncFuelFromExpenses}
                  disabled={isSyncing}
                  variant="outline"
                  className="gap-2"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isSyncing ? 'Syncing...' : 'Sync from Expenses'}
                </Button>
                <Button onClick={() => openFuelDialog()} className="gradient-gold text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Fuel Purchase
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Gallons</TableHead>
                    <TableHead className="text-right">$/Gallon</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : filteredFuelPurchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No fuel purchases for this quarter. Use "Sync from Expenses" to import.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFuelPurchases.map(fp => {
                      const isDiscount = fp.total_cost < 0;
                      return (
                        <TableRow key={fp.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {format(parseISO(fp.purchase_date), 'MM/dd/yyyy')}
                              {fp.source_expense_id && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/30 text-primary">
                                  <Link2 className="h-2.5 w-2.5 mr-0.5" />
                                  synced
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {isDiscount ? (
                              <Badge className="bg-success/10 text-success border-success/20 text-[11px]" variant="outline">
                                <TrendingDown className="h-3 w-3 mr-0.5" />
                                Discount
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px]">
                                <Fuel className="h-3 w-3 mr-0.5" />
                                Fuel
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {fp.jurisdiction}
                            </div>
                          </TableCell>
                          <TableCell>{getTruckName(fp.truck_id)}</TableCell>
                          <TableCell>{fp.vendor || '-'}</TableCell>
                          <TableCell className="text-right">{fp.gallons.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${fp.price_per_gallon.toFixed(3)}</TableCell>
                          <TableCell className={cn(
                            "text-right font-medium",
                            isDiscount ? 'text-success' : 'text-destructive'
                          )}>
                            {formatCurrency(fp.total_cost)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openFuelDialog(fp)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteFuelMutation.mutate(fp.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Unsynced expenses needing jurisdiction */}
          <UnsyncedExpenses expenses={unsyncedExpenses} trucks={trucks} />
        </TabsContent>

        <TabsContent value="summary" className="mt-6">
          <JurisdictionMap
            iftaRecords={iftaRecords}
            fuelPurchases={filteredFuelPurchases}
            fleetMpg={avgMpg}
            quarter={selectedQuarter}
          />
        </TabsContent>

        <TabsContent value="report" className="mt-6">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>IFTA Report - {selectedQuarter}</CardTitle>
                <CardDescription>Jurisdiction mileage and tax summary for filing</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={autoGenerateIFTA} 
                  disabled={isAutoGenerating}
                  variant="outline"
                  className="gap-2"
                >
                  {isAutoGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isAutoGenerating ? 'Generating...' : 'Auto-Generate from Loads'}
                </Button>
                {iftaRecords.length > 0 && (
                  <Button onClick={() => setPrintSummaryOpen(true)} variant="outline" className="gap-2">
                    <Printer className="h-4 w-4" />
                    Print Filing Summary
                  </Button>
                )}
                <Button onClick={exportToCSV} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            {isAutoGenerating && autoGenProgress.total > 0 && (
              <div className="px-6 pb-4 space-y-1.5">
                <Progress value={(autoGenProgress.current / autoGenProgress.total) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">{autoGenProgress.message}</p>
              </div>
            )}
            <CardContent>
              {iftaRecords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium text-foreground">No IFTA records for {selectedQuarter}</p>
                  <p className="text-sm mt-1 mb-4">
                    {quarterDeliveredLoads.length > 0
                      ? `${quarterDeliveredLoads.length} delivered load${quarterDeliveredLoads.length !== 1 ? 's' : ''} available for this quarter`
                      : 'No delivered loads found for this quarter'}
                  </p>
                  {filteredFuelPurchases.length === 0 && (
                    <p className="text-xs mb-3">Tip: Sync fuel purchases first for accurate tax calculations</p>
                  )}
                  <Button
                    onClick={autoGenerateIFTA}
                    disabled={isAutoGenerating || quarterDeliveredLoads.length === 0}
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Auto-Generate from Loads
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jurisdiction</TableHead>
                      <TableHead className="text-right">Total Miles<IFTATooltip term="Total Miles" /></TableHead>
                      <TableHead className="text-right">Taxable Miles<IFTATooltip term="Taxable Miles" /></TableHead>
                      <TableHead className="text-right">Fuel Gallons<IFTATooltip term="Gal Purchased" /></TableHead>
                      <TableHead className="text-right">Fuel Cost<IFTATooltip term="Fuel Cost" /></TableHead>
                      <TableHead className="text-right">Tax Rate<IFTATooltip term="Tax Rate" /></TableHead>
                      <TableHead className="text-right">Tax Owed<IFTATooltip term="Tax Owed" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {iftaRecords.map(record => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.jurisdiction}</TableCell>
                        <TableCell className="text-right">{record.total_miles.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{record.taxable_miles.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{record.fuel_gallons.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(record.fuel_cost)}</TableCell>
                        <TableCell className="text-right">${record.tax_rate.toFixed(4)}</TableCell>
                        <TableCell className={`text-right font-medium ${record.tax_owed >= 0 ? 'text-destructive' : 'text-success'}`}>
                          {formatCurrency(record.tax_owed)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">{summary.totalMiles.toLocaleString()}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">{iftaRecords.reduce((s, r) => s + r.fuel_gallons, 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(iftaRecords.reduce((s, r) => s + r.fuel_cost, 0))}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className={`text-right ${summary.taxOwed >= 0 ? 'text-destructive' : 'text-success'}`}>
                        {formatCurrency(summary.taxOwed)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Fuel Dialog */}
      <Dialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFuel ? 'Edit Fuel Purchase' : 'Add Fuel Purchase'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFuelSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purchase Date</Label>
                <Input
                  type="date"
                  value={fuelFormData.purchase_date || ''}
                  onChange={(e) => setFuelFormData({ ...fuelFormData, purchase_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State/Jurisdiction *</Label>
                <Select 
                  value={fuelFormData.jurisdiction || ''} 
                  onValueChange={(v) => setFuelFormData({ ...fuelFormData, jurisdiction: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Truck</Label>
                <Select 
                  value={fuelFormData.truck_id || 'none'} 
                  onValueChange={(v) => setFuelFormData({ ...fuelFormData, truck_id: v === 'none' ? null : v })}
                >
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
                <Label>Driver</Label>
                <Select 
                  value={fuelFormData.driver_id || 'none'} 
                  onValueChange={(v) => setFuelFormData({ ...fuelFormData, driver_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vendor/Station</Label>
              <Input
                value={fuelFormData.vendor || ''}
                onChange={(e) => setFuelFormData({ ...fuelFormData, vendor: e.target.value })}
                placeholder="e.g., Pilot, Love's, TA"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Gallons *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={fuelFormData.gallons || ''}
                  onChange={(e) => {
                    const gallons = parseFloat(e.target.value) || 0;
                    const ppg = fuelFormData.price_per_gallon || 0;
                    setFuelFormData({ 
                      ...fuelFormData, 
                      gallons, 
                      total_cost: gallons * ppg 
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Price/Gallon</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={fuelFormData.price_per_gallon || ''}
                  onChange={(e) => {
                    const ppg = parseFloat(e.target.value) || 0;
                    const gallons = fuelFormData.gallons || 0;
                    setFuelFormData({ 
                      ...fuelFormData, 
                      price_per_gallon: ppg, 
                      total_cost: gallons * ppg 
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Total Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={fuelFormData.total_cost || ''}
                  onChange={(e) => setFuelFormData({ ...fuelFormData, total_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeFuelDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingFuel ? 'Update' : 'Add'} Purchase
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Quarter Dialog */}
      <ResetQuarterDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        onConfirm={handleResetQuarter}
        quarter={selectedQuarter}
      />

      {/* Print Filing Summary */}
      <IFTAPrintSummary
        open={printSummaryOpen}
        onOpenChange={setPrintSummaryOpen}
        quarter={selectedQuarter}
        iftaRecords={iftaRecords}
        fuelPurchases={filteredFuelPurchases}
        fleetMpg={avgMpg}
      />

      </TooltipProvider>
    </>
  );
}
