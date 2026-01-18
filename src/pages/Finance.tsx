import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, TrendingDown, Percent, Receipt, PiggyBank, Calculator, Route, Pencil, Trash2, Plus, Fuel, Truck as TruckIcon } from 'lucide-react';
import { format, parseISO, endOfMonth, endOfQuarter, isWithinInterval } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';

type Expense = Database['public']['Tables']['expenses']['Row'];
type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];

const expenseTypes = [
  'Fuel',
  'DEF',
  'Truck Payment',
  'Trailer Payment',
  'Licensing/Permits',
  'Insurance',
  'LCN/Satellite',
  'Maintenance',
  'Cell Phone',
  'Trip Scanning',
  'Card Load',
  'IFTA',
  'PrePass/Scale',
  'Tolls',
  'Parking',
  'Misc'
];

const GALLONS_EXPENSE_TYPES = ['Fuel', 'DEF'];

export default function Finance() {
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-Q1');
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseFormData, setExpenseFormData] = useState<Partial<ExpenseInsert>>({});

  const { data: settings = [] } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*').order('pickup_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: loadExpenses = [] } = useQuery({
    queryKey: ['load_expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('load_expenses').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*');
      if (error) throw error;
      return data;
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('company_settings')
        .update({ setting_value: value })
        .eq('setting_key', key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] });
      toast.success('Settings updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (expense: ExpenseInsert) => {
      const { error } = await supabase.from('expenses').insert(expense);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense added');
      closeExpenseDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Expense> & { id: string }) => {
      const { error } = await supabase.from('expenses').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense updated');
      closeExpenseDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openExpenseDialog = (expense?: Expense) => {
    setEditingExpense(expense || null);
    setExpenseFormData(expense || { expense_type: 'Fuel' });
    setExpenseDialogOpen(true);
  };

  const closeExpenseDialog = () => {
    setExpenseDialogOpen(false);
    setEditingExpense(null);
    setExpenseFormData({});
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseFormData.expense_type || !expenseFormData.amount) {
      toast.error('Please fill in required fields');
      return;
    }
    if (editingExpense) {
      updateExpenseMutation.mutate({ id: editingExpense.id, ...expenseFormData });
    } else {
      createExpenseMutation.mutate(expenseFormData as ExpenseInsert);
    }
  };

  const getSetting = (key: string, defaultValue: string = '0') => {
    const setting = settings.find((s: any) => s.setting_key === key);
    return setting?.setting_value || defaultValue;
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  // Filter loads by selected period
  const getFilteredLoads = () => {
    if (selectedPeriod === 'all') return loads;
    
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    
    if (period.startsWith('Q')) {
      const quarter = parseInt(period.substring(1));
      const startMonth = (quarter - 1) * 3;
      const start = new Date(yearNum, startMonth, 1);
      const end = endOfQuarter(start);
      
      return loads.filter((l: any) => {
        if (!l.pickup_date) return false;
        const date = parseISO(l.pickup_date);
        return isWithinInterval(date, { start, end });
      });
    } else {
      const month = parseInt(period) - 1;
      const start = new Date(yearNum, month, 1);
      const end = endOfMonth(start);
      
      return loads.filter((l: any) => {
        if (!l.pickup_date) return false;
        const date = parseISO(l.pickup_date);
        return isWithinInterval(date, { start, end });
      });
    }
  };

  // Filter standalone expenses by period
  const getFilteredExpenses = () => {
    if (selectedPeriod === 'all') return expenses;
    
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    
    if (period.startsWith('Q')) {
      const quarter = parseInt(period.substring(1));
      const startMonth = (quarter - 1) * 3;
      const start = new Date(yearNum, startMonth, 1);
      const end = endOfQuarter(start);
      
      return expenses.filter((e: Expense) => {
        if (!e.expense_date) return false;
        const date = parseISO(e.expense_date);
        return isWithinInterval(date, { start, end });
      });
    } else {
      const month = parseInt(period) - 1;
      const start = new Date(yearNum, month, 1);
      const end = endOfMonth(start);
      
      return expenses.filter((e: Expense) => {
        if (!e.expense_date) return false;
        const date = parseISO(e.expense_date);
        return isWithinInterval(date, { start, end });
      });
    }
  };

  const filteredLoads = getFilteredLoads();
  const filteredExpenses = getFilteredExpenses();

  // Calculate deadhead miles (empty miles between loads)
  // Sort loads by pickup_date to find consecutive loads
  const sortedLoads = [...filteredLoads]
    .filter((l: any) => l.pickup_date && l.start_miles != null && l.end_miles != null)
    .sort((a: any, b: any) => {
      const dateA = parseISO(a.pickup_date);
      const dateB = parseISO(b.pickup_date);
      return dateA.getTime() - dateB.getTime();
    });

  // Calculate deadhead miles between consecutive loads
  let deadheadMiles = 0;
  for (let i = 1; i < sortedLoads.length; i++) {
    const prevLoad = sortedLoads[i - 1];
    const currLoad = sortedLoads[i];
    
    // Deadhead = current load's start_miles - previous load's end_miles
    if (prevLoad.end_miles != null && currLoad.start_miles != null) {
      const gap = currLoad.start_miles - prevLoad.end_miles;
      // Only count positive gaps (negative would mean overlapping or data error)
      if (gap > 0) {
        deadheadMiles += gap;
      }
    }
  }

  // Calculate P&L totals
  const revenueTotals = filteredLoads.reduce((acc: any, load: any) => ({
    loadCount: acc.loadCount + 1,
    bookedLinehaul: acc.bookedLinehaul + (load.rate || 0),
    bookedMiles: acc.bookedMiles + (load.booked_miles || 0),
    fuelSurcharge: acc.fuelSurcharge + (load.fuel_surcharge || 0),
    advanceAvailable: acc.advanceAvailable + (load.advance_available || 0),
    advanceTaken: acc.advanceTaken + (load.advance_taken || 0),
    lumper: acc.lumper + (load.lumper || 0),
    accessorials: acc.accessorials + (load.accessorials || 0),
    grossRevenue: acc.grossRevenue + (load.gross_revenue || 0),
    truckRevenue: acc.truckRevenue + (load.truck_revenue || 0),
    trailerRevenue: acc.trailerRevenue + (load.trailer_revenue || 0),
    netRevenue: acc.netRevenue + (load.net_revenue || 0),
    settlement: acc.settlement + (load.settlement || 0),
    actualMiles: acc.actualMiles + (load.actual_miles || 0),
  }), {
    loadCount: 0, bookedLinehaul: 0, bookedMiles: 0, fuelSurcharge: 0,
    advanceAvailable: 0, advanceTaken: 0, lumper: 0, accessorials: 0,
    grossRevenue: 0, truckRevenue: 0, trailerRevenue: 0, netRevenue: 0,
    settlement: 0, actualMiles: 0,
  });

  // Total empty miles = deadhead between loads + (actual - booked per load)
  const perLoadEmptyMiles = revenueTotals.actualMiles - revenueTotals.bookedMiles;
  const totalEmptyMiles = deadheadMiles + Math.max(0, perLoadEmptyMiles);
  // Total actual miles for percentage = actual miles from loads + deadhead
  const totalActualMilesWithDeadhead = revenueTotals.actualMiles + deadheadMiles;

  // Get load expenses for filtered loads
  const loadIds = filteredLoads.map((l: any) => l.id);
  const filteredLoadExpenses = loadExpenses.filter((e: any) => loadIds.includes(e.load_id));
  
  const loadExpenseTotals = filteredLoadExpenses.reduce((acc: any, exp: any) => ({
    fuelGallons: acc.fuelGallons + (exp.fuel_gallons || 0),
    fuelCost: acc.fuelCost + (exp.fuel_cost || 0),
    truckPayment: acc.truckPayment + (exp.truck_payment || 0),
    trailerPayment: acc.trailerPayment + (exp.trailer_payment || 0),
    insurance: acc.insurance + (exp.insurance || 0),
    licensingPermits: acc.licensingPermits + (exp.licensing_permits || 0),
    lcnSatellite: acc.lcnSatellite + (exp.lcn_satellite || 0),
    cellPhone: acc.cellPhone + (exp.cell_phone || 0),
    tires: acc.tires + (exp.tires || 0),
    oil: acc.oil + (exp.oil || 0),
    repairsParts: acc.repairsParts + (exp.repairs_parts || 0),
    tolls: acc.tolls + (exp.tolls || 0),
    prepassScale: acc.prepassScale + (exp.prepass_scale || 0),
    maintenanceFund: acc.maintenanceFund + (exp.maintenance_fund || 0),
    savings: acc.savings + (exp.savings || 0),
    retirement: acc.retirement + (exp.retirement || 0),
    miscOperating: acc.miscOperating + (exp.misc_operating || 0),
    operatingTotal: acc.operatingTotal + (exp.operating_total || 0),
    personalTotal: acc.personalTotal + (exp.personal_total || 0),
  }), {
    fuelGallons: 0, fuelCost: 0, truckPayment: 0, trailerPayment: 0,
    insurance: 0, licensingPermits: 0, lcnSatellite: 0, cellPhone: 0,
    tires: 0, oil: 0, repairsParts: 0, tolls: 0, prepassScale: 0,
    maintenanceFund: 0, savings: 0, retirement: 0, miscOperating: 0,
    operatingTotal: 0, personalTotal: 0,
  });

  // Separate standalone expenses (no load_id) from load-linked expenses
  const standaloneExpenses = filteredExpenses.filter((e: Expense) => !e.load_id);
  const loadLinkedExpenses = filteredExpenses.filter((e: Expense) => e.load_id && loadIds.includes(e.load_id));

  // Calculate standalone expense totals by type
  const standaloneExpenseTotals = standaloneExpenses.reduce((acc: any, exp: Expense) => {
    acc.total += Number(exp.amount) || 0;
    acc.byType[exp.expense_type] = (acc.byType[exp.expense_type] || 0) + (Number(exp.amount) || 0);
    if (exp.gallons) {
      acc.gallonsByType[exp.expense_type] = (acc.gallonsByType[exp.expense_type] || 0) + (Number(exp.gallons) || 0);
    }
    return acc;
  }, { total: 0, byType: {}, gallonsByType: {} });

  // Calculate load-linked expense totals from expenses table
  const loadLinkedExpenseTotals = loadLinkedExpenses.reduce((acc: any, exp: Expense) => {
    acc.total += Number(exp.amount) || 0;
    acc.byType[exp.expense_type] = (acc.byType[exp.expense_type] || 0) + (Number(exp.amount) || 0);
    if (exp.gallons) {
      acc.gallonsByType[exp.expense_type] = (acc.gallonsByType[exp.expense_type] || 0) + (Number(exp.gallons) || 0);
    }
    return acc;
  }, { total: 0, byType: {}, gallonsByType: {} });

  const totalExpenses = loadExpenseTotals.operatingTotal + standaloneExpenseTotals.total + loadLinkedExpenseTotals.total;
  const netProfit = revenueTotals.netRevenue - totalExpenses;
  const profitMargin = revenueTotals.netRevenue > 0 ? (netProfit / revenueTotals.netRevenue) * 100 : 0;

  const getTruckName = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find((t: any) => t.id === truckId);
    return truck ? truck.unit_number : '-';
  };

  const getLoadName = (loadId: string | null) => {
    if (!loadId) return '-';
    const load = loads.find((l: any) => l.id === loadId);
    return load?.landstar_load_id || 'Linked';
  };

  const handleSaveSettings = () => {
    Object.entries(settingsForm).forEach(([key, value]) => {
      if (value !== getSetting(key)) {
        updateSettingMutation.mutate({ key, value: String(value) });
      }
    });
    setEditingSettings(false);
  };

  const startEditSettings = () => {
    setSettingsForm({
      gross_percentage: getSetting('gross_percentage', '100'),
      truck_percentage: getSetting('truck_percentage', '65'),
      trailer_percentage: getSetting('trailer_percentage', '7'),
      power_only_percentage: getSetting('power_only_percentage', '5'),
      advance_percentage: getSetting('advance_percentage', '30'),
      owns_trailer: getSetting('owns_trailer', 'false'),
    });
    setEditingSettings(true);
  };

  const expenseColumns = [
    { key: 'expense_date', header: 'Date', render: (e: Expense) => e.expense_date ? format(parseISO(e.expense_date), 'MM/dd/yyyy') : '-' },
    { key: 'expense_type', header: 'Type' },
    { key: 'description', header: 'Description', render: (e: Expense) => e.description || '-' },
    { 
      key: 'amount', 
      header: 'Amount', 
      render: (e: Expense) => <span className="text-destructive font-medium">{formatCurrency(Number(e.amount))}</span>
    },
    { key: 'gallons', header: 'Gallons', render: (e: Expense) => e.gallons ? `${e.gallons} gal` : '-' },
    { key: 'truck_id', header: 'Truck', render: (e: Expense) => getTruckName(e.truck_id) },
    { key: 'load_id', header: 'Load', render: (e: Expense) => getLoadName(e.load_id) },
    {
      key: 'actions',
      header: 'Actions',
      render: (expense: Expense) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={(ev) => { ev.stopPropagation(); openExpenseDialog(expense); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={(ev) => { ev.stopPropagation(); deleteExpenseMutation.mutate(expense.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Finance & P/L" description="Track revenue, expenses, and profitability" />

      {/* Period Selector */}
      <div className="flex gap-4 mb-6">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="2026-Q1">Q1 2026</SelectItem>
            <SelectItem value="2026-1">January 2026</SelectItem>
            <SelectItem value="2026-2">February 2026</SelectItem>
            <SelectItem value="2026-3">March 2026</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            {netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">{revenueTotals.loadCount} loads</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</div>
            <p className="text-xs text-muted-foreground">All operating costs</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>
              {profitMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Net profit / Revenue</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="summary">P&L Summary</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Details</TabsTrigger>
          <TabsTrigger value="expenses">Manage Expenses</TabsTrigger>
          <TabsTrigger value="expense-summary">Expense Summary</TabsTrigger>
          <TabsTrigger value="settings">Compensation Package</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6">
          {/* P&L Header Summary - matching spreadsheet format */}
          <Card className="card-elevated mb-6">
            <CardHeader>
              <CardTitle>Profit/Loss Summary for {selectedPeriod === 'all' ? 'All Time' : selectedPeriod.replace('-', ' ')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6 text-center">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">100% GROSS</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueTotals.grossRevenue)}</p>
                </div>
                <div className="p-4 bg-primary/10 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">TRUCK REVENUE ({getSetting('truck_percentage', '65')}%)</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueTotals.truckRevenue)}</p>
                </div>
                <div className="p-4 bg-success/10 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">NET PROFIT</p>
                  <p className="text-2xl font-bold text-success">{formatCurrency(netProfit)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Revenue Summary */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-success" />
                  Revenue Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell>GROSS L/H</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.bookedLinehaul)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        FSC REV 
                        <span className="text-muted-foreground text-xs ml-2">
                          ({revenueTotals.grossRevenue > 0 ? ((revenueTotals.fuelSurcharge / revenueTotals.grossRevenue) * 100).toFixed(2) : 0}% of Gross)
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.fuelSurcharge)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Accessorials</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.accessorials)}</TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-medium">Gross Revenue (100%)</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(revenueTotals.grossRevenue)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Truck Revenue ({getSetting('truck_percentage', '65')}%)</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.truckRevenue)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Trailer Revenue ({getSetting('trailer_percentage', '7')}%)</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.trailerRevenue)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-success/10">
                      <TableCell className="font-bold">TOTAL REV (Net Revenue)</TableCell>
                      <TableCell className="text-right font-bold text-success">{formatCurrency(revenueTotals.netRevenue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Miles Summary */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Route className="h-5 w-5 text-primary" />
                  Miles Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell>Paid Miles (Booked)</TableCell>
                      <TableCell className="text-right font-mono">{revenueTotals.bookedMiles.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Actual Miles</TableCell>
                      <TableCell className="text-right font-mono">{revenueTotals.actualMiles.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Deadhead Miles (Between Loads)</TableCell>
                      <TableCell className="text-right font-mono">{deadheadMiles.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Empty Miles</TableCell>
                      <TableCell className="text-right font-mono">
                        {totalEmptyMiles.toLocaleString()}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t">
                      <TableCell className="font-medium">% of Empty Miles</TableCell>
                      <TableCell className="text-right font-medium">
                        {totalActualMilesWithDeadhead > 0 
                          ? ((totalEmptyMiles / totalActualMilesWithDeadhead) * 100).toFixed(2)
                          : 0}%
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-medium">Revenue Per Paid Mile</TableCell>
                      <TableCell className="text-right font-medium text-success">
                        {revenueTotals.bookedMiles > 0 ? formatCurrency(revenueTotals.netRevenue / revenueTotals.bookedMiles) : '$0.00'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Revenue Per Actual Mile</TableCell>
                      <TableCell className="text-right font-medium">
                        {totalActualMilesWithDeadhead > 0 ? formatCurrency(revenueTotals.netRevenue / totalActualMilesWithDeadhead) : '$0.00'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Net Profit Calculation */}
          <Card className="card-elevated mt-6">
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Net Revenue</span>
                    <span className="font-mono text-success">{formatCurrency(revenueTotals.netRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Expenses</span>
                    <span className="font-mono text-destructive">-{formatCurrency(totalExpenses)}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">{netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}</span>
                      <span className={`font-bold text-2xl ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(netProfit)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Loads</p>
                    <p className="text-2xl font-bold">{revenueTotals.loadCount}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Profit Margin</p>
                    <p className={`text-2xl font-bold ${profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {profitMargin.toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Avg Per Load</p>
                    <p className="text-xl font-bold">
                      {revenueTotals.loadCount > 0 ? formatCurrency(netProfit / revenueTotals.loadCount) : '$0.00'}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Profit Per Mile</p>
                    <p className="text-xl font-bold">
                      {revenueTotals.actualMiles > 0 ? formatCurrency(netProfit / revenueTotals.actualMiles) : '$0.00'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Load-by-Load Revenue</CardTitle>
              <CardDescription>Detailed revenue breakdown for each load</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Load ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="text-right">Linehaul</TableHead>
                      <TableHead className="text-right">FSC</TableHead>
                      <TableHead className="text-right">Accessorials</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Truck</TableHead>
                      <TableHead className="text-right">Trailer</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Miles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLoads.map((load: any) => (
                      <TableRow key={load.id}>
                        <TableCell>{load.pickup_date ? format(parseISO(load.pickup_date), 'MM/dd') : '-'}</TableCell>
                        <TableCell className="font-mono">{load.landstar_load_id || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{load.origin} → {load.destination}</TableCell>
                        <TableCell className="text-right">{formatCurrency(load.rate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(load.fuel_surcharge)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(load.accessorials)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(load.gross_revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(load.truck_revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(load.trailer_revenue)}</TableCell>
                        <TableCell className="text-right font-medium text-success">{formatCurrency(load.net_revenue)}</TableCell>
                        <TableCell className="text-right">{load.actual_miles?.toLocaleString() || '-'}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell colSpan={3}>Totals ({revenueTotals.loadCount} loads)</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.bookedLinehaul)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.fuelSurcharge)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.accessorials)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.grossRevenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.truckRevenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.trailerRevenue)}</TableCell>
                      <TableCell className="text-right text-success">{formatCurrency(revenueTotals.netRevenue)}</TableCell>
                      <TableCell className="text-right">{revenueTotals.actualMiles.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Manage Expenses
                </CardTitle>
                <CardDescription>
                  Track expenses by type, optionally link to a load or truck
                </CardDescription>
              </div>
              <Button onClick={() => openExpenseDialog()} className="gradient-gold text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" /> Add Expense
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable 
                columns={expenseColumns} 
                data={filteredExpenses} 
                loading={expensesLoading} 
                emptyMessage="No expenses recorded yet" 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expense-summary" className="mt-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-destructive" />
                Expense Summary by Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-4">Standalone Expenses</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenseTypes.map(type => {
                        const amount = standaloneExpenseTotals.byType[type] || 0;
                        const gallons = standaloneExpenseTotals.gallonsByType[type] || 0;
                        if (amount === 0) return null;
                        return (
                          <TableRow key={type}>
                            <TableCell className="flex items-center gap-2">
                              {(type === 'Fuel' || type === 'DEF') && <Fuel className="h-4 w-4" />}
                              {(type === 'Truck Payment' || type === 'Maintenance') && <TruckIcon className="h-4 w-4" />}
                              {type}
                              {gallons > 0 && (
                                <span className="text-xs text-muted-foreground">({gallons.toFixed(1)} gal)</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-destructive/10">
                        <TableCell className="font-bold">Total Standalone Expenses</TableCell>
                        <TableCell className="text-right font-bold text-destructive">{formatCurrency(standaloneExpenseTotals.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <h3 className="font-medium mb-4">Load-Linked Expenses</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Expenses from expenses table linked to loads */}
                      {expenseTypes.map(type => {
                        const amount = loadLinkedExpenseTotals.byType[type] || 0;
                        const gallons = loadLinkedExpenseTotals.gallonsByType[type] || 0;
                        if (amount === 0) return null;
                        return (
                          <TableRow key={type}>
                            <TableCell className="flex items-center gap-2">
                              {(type === 'Fuel' || type === 'DEF') && <Fuel className="h-4 w-4" />}
                              {(type === 'Truck Payment' || type === 'Maintenance') && <TruckIcon className="h-4 w-4" />}
                              {type}
                              {gallons > 0 && (
                                <span className="text-xs text-muted-foreground">({gallons.toFixed(1)} gal)</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Legacy load_expenses table data */}
                      {loadExpenseTotals.fuelCost > 0 && (
                        <TableRow>
                          <TableCell>Fuel Cost (Legacy)</TableCell>
                          <TableCell className="text-right">{formatCurrency(loadExpenseTotals.fuelCost)}</TableCell>
                        </TableRow>
                      )}
                      {loadExpenseTotals.truckPayment > 0 && (
                        <TableRow>
                          <TableCell>Truck Payment (Legacy)</TableCell>
                          <TableCell className="text-right">{formatCurrency(loadExpenseTotals.truckPayment)}</TableCell>
                        </TableRow>
                      )}
                      {loadExpenseTotals.operatingTotal > 0 && (
                        <TableRow>
                          <TableCell>Other Operating (Legacy)</TableCell>
                          <TableCell className="text-right">{formatCurrency(loadExpenseTotals.operatingTotal - loadExpenseTotals.fuelCost - loadExpenseTotals.truckPayment)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-destructive/10">
                        <TableCell className="font-bold">Total Load-Linked Expenses</TableCell>
                        <TableCell className="text-right font-bold text-destructive">{formatCurrency(loadLinkedExpenseTotals.total + loadExpenseTotals.operatingTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">GRAND TOTAL EXPENSES</span>
                  <span className="font-bold text-2xl text-destructive">{formatCurrency(totalExpenses)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Compensation Package
              </CardTitle>
              <CardDescription>
                Configure your revenue split percentages and advance rates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {editingSettings ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Gross Percentage (%)</Label>
                      <Input 
                        type="number" 
                        value={settingsForm.gross_percentage || ''} 
                        onChange={(e) => setSettingsForm({ ...settingsForm, gross_percentage: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Truck Percentage</Label>
                      <Input 
                        type="number" 
                        value={settingsForm.truck_percentage || ''} 
                        onChange={(e) => setSettingsForm({ ...settingsForm, truck_percentage: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Trailer Percentage</Label>
                      <Input 
                        type="number" 
                        value={settingsForm.trailer_percentage || ''} 
                        onChange={(e) => setSettingsForm({ ...settingsForm, trailer_percentage: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Power Only Percentage</Label>
                      <Input 
                        type="number" 
                        value={settingsForm.power_only_percentage || ''} 
                        onChange={(e) => setSettingsForm({ ...settingsForm, power_only_percentage: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Advance Percentage</Label>
                      <Input 
                        type="number" 
                        value={settingsForm.advance_percentage || ''} 
                        onChange={(e) => setSettingsForm({ ...settingsForm, advance_percentage: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Owns Trailer</Label>
                      <Select 
                        value={settingsForm.owns_trailer || 'false'} 
                        onValueChange={(v) => setSettingsForm({ ...settingsForm, owns_trailer: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveSettings} className="gradient-gold text-primary-foreground">Save Changes</Button>
                    <Button variant="outline" onClick={() => setEditingSettings(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Gross Percentage</p>
                      <p className="text-2xl font-bold">{getSetting('gross_percentage', '100')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Truck Percentage</p>
                      <p className="text-2xl font-bold">{getSetting('truck_percentage', '65')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Trailer Percentage</p>
                      <p className="text-2xl font-bold">{getSetting('trailer_percentage', '7')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Power Only</p>
                      <p className="text-2xl font-bold">{getSetting('power_only_percentage', '5')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Advance Rate</p>
                      <p className="text-2xl font-bold">{getSetting('advance_percentage', '30')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Owns Trailer</p>
                      <p className="text-2xl font-bold">{getSetting('owns_trailer', 'false') === 'true' ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                  <Button onClick={startEditSettings} variant="outline">Edit Settings</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expense_date">Date</Label>
                <Input 
                  id="expense_date" 
                  type="date" 
                  value={expenseFormData.expense_date || ''} 
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, expense_date: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense_type">Type *</Label>
                <Select 
                  value={expenseFormData.expense_type || 'Fuel'} 
                  onValueChange={(v) => setExpenseFormData({ ...expenseFormData, expense_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {expenseTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($) *</Label>
                <Input 
                  id="amount" 
                  type="number" 
                  step="0.01" 
                  value={expenseFormData.amount || ''} 
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: parseFloat(e.target.value) || 0 })} 
                  required 
                />
              </div>
              {GALLONS_EXPENSE_TYPES.includes(expenseFormData.expense_type || '') && (
                <div className="space-y-2">
                  <Label htmlFor="gallons">Gallons</Label>
                  <Input 
                    id="gallons" 
                    type="number" 
                    step="0.01" 
                    value={expenseFormData.gallons || ''} 
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, gallons: parseFloat(e.target.value) || undefined })} 
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input 
                id="description" 
                value={expenseFormData.description || ''} 
                onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })} 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input 
                id="vendor" 
                value={expenseFormData.vendor || ''} 
                onChange={(e) => setExpenseFormData({ ...expenseFormData, vendor: e.target.value })} 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="truck_id">Link to Truck</Label>
                <Select 
                  value={expenseFormData.truck_id || 'none'} 
                  onValueChange={(v) => setExpenseFormData({ ...expenseFormData, truck_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {trucks.map((truck: any) => (
                      <SelectItem key={truck.id} value={truck.id}>{truck.unit_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="load_id">Link to Load</Label>
                <Select 
                  value={expenseFormData.load_id || 'none'} 
                  onValueChange={(v) => setExpenseFormData({ ...expenseFormData, load_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {loads.slice(0, 20).map((load: any) => (
                      <SelectItem key={load.id} value={load.id}>{load.landstar_load_id || `${load.origin} → ${load.destination}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                value={expenseFormData.notes || ''} 
                onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })} 
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeExpenseDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingExpense ? 'Save Changes' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
