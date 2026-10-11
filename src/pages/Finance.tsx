import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, TrendingDown, Percent, Receipt, PiggyBank, Calculator, Route, Pencil, Trash2, Plus, Fuel, Truck as TruckIcon, Users, Briefcase, CheckSquare, ArrowUpDown, ArrowUp, ArrowDown, MapPin, Banknote, MoreHorizontal, Landmark, Upload } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
const StatementUpload = lazy(() =>
  import('@/components/finance/StatementUpload').then(m => ({ default: m.StatementUpload })),
);
import { ChartSkeleton, DialogSkeleton } from '@/components/shared/LazyFallbacks';
import { YearToDateCheck } from '@/components/finance/YearToDateCheck';
import { TrueUpLoads } from '@/components/finance/TrueUpLoads';
import { WeeklyProof } from '@/components/finance/WeeklyProof';
import { YearLedger } from '@/components/finance/YearLedger';
import { RevenueOverview } from '@/components/finance/RevenueOverview';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { PLSummaryTab } from '@/components/finance/PLSummaryTab';
import { SettlementStatementTab } from '@/components/finance/SettlementStatementTab';
import { PossibleDuplicates } from '@/components/finance/PossibleDuplicates';
import { ImportedLinesToCheck } from '@/components/finance/ImportedLinesToCheck';
import { ExpenseSummary } from '@/components/finance/ExpenseSummary';
import { ExpensesList } from '@/components/finance/ExpensesList';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { driverPayTotals, fuelStats } from '@/lib/pl-metrics';
const RevenueTab = lazy(() =>
  import('@/components/finance/RevenueTab').then(m => ({ default: m.RevenueTab })),
);
import { CommissionsTab } from '@/components/finance/CommissionsTab';
import { DriverSettlementsTab } from '@/components/finance/driver-settlements/DriverSettlementsTab';
import { ActiveBatchTab } from '@/components/finance/inhouse-payroll/ActiveBatchTab';


import { CompensationSettingsTab } from '@/components/finance/CompensationSettingsTab';
import { SafetyBonusSettings } from '@/components/finance/SafetyBonusSettings';
import { SafetyBonusPayouts } from '@/components/finance/SafetyBonusPayouts';
import { format, parseISO, endOfMonth, endOfQuarter, endOfDay, isWithinInterval, startOfMonth, startOfQuarter, subMonths, addMonths } from 'date-fns';
import { settlementWeek } from '@/lib/settlement-week';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { InvoicingTab } from '@/components/finance/InvoicingTab';
import { FactoringTab } from '@/components/finance/FactoringTab';

const LoadProfitabilityTab = lazy(() =>
  import('@/components/finance/LoadProfitabilityTab').then(m => ({ default: m.LoadProfitabilityTab })),
);
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';
import { US_STATES } from '@/lib/us-states';
import { EXPENSE_TYPES, GALLONS_EXPENSE_TYPES, ADVANCE_EXPENSE_TYPES, CREDIT_EXPENSE_TYPES, isAdvanceExpense, isCreditExpense, isActualExpense } from '@/lib/expense-types';

type Expense = Database['public']['Tables']['expenses']['Row'];
type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
type DriverPayroll = Database['public']['Tables']['driver_payroll']['Row'];
type AgentCommission = Database['public']['Tables']['agent_commissions']['Row'];

export default function Finance() {
  const queryClient = useQueryClient();
  const { orgId, hasRole } = useAuth();
  const canManagePayroll = hasRole('owner') || hasRole('payroll_admin');
  const { isIndependent } = useOrganizationMode();
  // Default to current month
  // Opens on the current Landstar settlement week: "this week's settlement" is a top phone job.
  const defaultPeriod = 'week';
  const [selectedPeriod, setSelectedPeriod] = useState<string>(defaultPeriod);
  const [selectedTruck, setSelectedTruck] = useState<string>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showW2Batch, setShowW2Batch] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseFormData, setExpenseFormData] = useState<Partial<ExpenseInsert>>({});
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [massEditDialogOpen, setMassEditDialogOpen] = useState(false);
  const [massEditFormData, setMassEditFormData] = useState<Partial<ExpenseInsert>>({});
  const [massDeleteDialogOpen, setMassDeleteDialogOpen] = useState(false);
  const [isMassDeleting, setIsMassDeleting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expensePage, setExpensePage] = useState(0);
  const EXPENSES_PER_PAGE = 50;

  type SortField = 'expense_date' | 'expense_type' | 'description' | 'amount' | 'gallons' | 'truck_id' | 'load_id';
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('expense_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // ===== QUERIES =====
  const { data: settings = [] } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: loads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*').is('deleted_at', null).order('pickup_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: loadExpenses = [] } = useQuery({
    queryKey: ['load_expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('load_expenses').select('*').is('deleted_at', null);
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
      const { data, error } = await supabase.from('trucks').select('*').is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  // Truck loan payments are a real operating cost. The loan ledger (Trucks page)
  // is the source of truth; any auto-posted 'Truck Loan' expense rows mirror it
  // and are excluded below so a payment is never counted twice.
  const { data: truckLoanPayments = [] } = useQuery({
    queryKey: ['truck_loan_payments'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('truck_loan_payments')
        .select('id, truck_id, payment_date, amount');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; truck_id: string; payment_date: string; amount: number }>;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  const { data: payrolls = [], isLoading: payrollsLoading } = useQuery({
    queryKey: ['driver_payroll'],
    queryFn: async () => {
      const { data, error } = await supabase.from('driver_payroll').select('*').is('deleted_at', null).order('period_end', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Driver pay lives in generated settlement statements as well as W-2 payroll batches.
  const { data: driverSettlements = [] } = useQuery({
    queryKey: ['driver_settlements_cost'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlements')
        .select('driver_id, period_end, status, gross_pay, reimbursements')
        .is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  // Approved or paid safety bonuses are driver pay too.
  const { data: safetyBonuses = [] } = useQuery({
    queryKey: ['safety_bonus_payouts_cost'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_bonus_payouts')
        .select('period_end, status, earned_amount, paid_in_settlement_id')
        .is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  const { data: commissions = [], isLoading: commissionsLoading } = useQuery({
    queryKey: ['agent_commissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agent_commissions').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // ===== EXPENSE MUTATIONS =====
  const createExpenseMutation = useMutation({
    mutationFn: async (expense: ExpenseInsert) => {
      const { error } = await supabase.from('expenses').insert(expense);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense added'); closeExpenseDialog(); },
    onError: (error) => toast.error(error.message),
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Expense> & { id: string }) => {
      const { error } = await supabase.from('expenses').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense updated'); closeExpenseDialog(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteExpenseMutation = useMutation({
    // Archived, not erased: the Archive page can restore it, and the toast offers Undo.
    mutationFn: async (id: string) => {
      const { archiveWithUndo } = await import('@/lib/soft-delete');
      await archiveWithUndo({ table: 'expenses', id, queryClient, invalidateKeys: [['expenses']] });
    },
    onError: (error) => toast.error(error.message),
  });

  const massUpdateExpensesMutation = useMutation({
    mutationFn: async (updates: Partial<ExpenseInsert>) => {
      const ids = Array.from(selectedExpenseIds);
      const { error } = await supabase.from('expenses').update(updates).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(`${selectedExpenseIds.size} expenses updated`);
      setSelectedExpenseIds(new Set());
      closeMassEditDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleMassDelete = async () => {
    setIsMassDeleting(true);
    try {
      const ids = Array.from(selectedExpenseIds);
      const { archiveManyWithUndo } = await import('@/lib/soft-delete');
      await archiveManyWithUndo({ table: 'expenses', ids, queryClient, invalidateKeys: [['expenses']] });
      setSelectedExpenseIds(new Set());
      setMassDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to archive expenses');
    } finally {
      setIsMassDeleting(false);
    }
  };

  // ===== HELPERS =====
  const getSetting = (key: string, defaultValue: string = '0') => {
    const setting = settings.find((s: any) => s.setting_key === key);
    return setting?.setting_value || defaultValue;
  };

  const getDriverName = (driverId: string) => {
    const driver = drivers.find((d: any) => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : '-';
  };

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

  // ===== PERIOD FILTERING =====
  // One place that turns the period picker into a date range.
  // 'week' is the current Landstar settlement week (Thu to the period-ending Wed).
  const periodInterval = (): { start: Date; end: Date } | null => {
    if (selectedPeriod === 'all') return null;
    if (selectedPeriod === 'week') {
      const w = settlementWeek(new Date());
      return { start: w.start, end: endOfDay(w.end) };
    }
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    if (period.startsWith('Q')) {
      const start = new Date(yearNum, (parseInt(period.substring(1)) - 1) * 3, 1);
      return { start, end: endOfQuarter(start) };
    }
    const start = new Date(yearNum, parseInt(period) - 1, 1);
    return { start, end: endOfMonth(start) };
  };
  const inPeriod = (date: string | null | undefined) => {
    const range = periodInterval();
    if (!range) return true;
    return !!date && isWithinInterval(parseISO(date), range);
  };

  const filterByPeriod = <T extends Record<string, any>>(items: T[], dateField: string): T[] => {
    let filtered = items;
    if (selectedTruck !== 'all' && 'truck_id' in (filtered[0] || {})) {
      filtered = filtered.filter((item) => (item as any).truck_id === selectedTruck);
    }
    return filtered.filter((item) => inPeriod(item[dateField]));
  };

  const getFilteredLoads = () => {
    let filtered = loads;
    if (selectedTruck !== 'all') filtered = filtered.filter((l: any) => l.truck_id === selectedTruck);
    // Revenue is recognized on delivery (that's when Landstar pays), matching the
    // Executive Dashboard. Loads without a delivery date fall back to pickup.
    return filtered.filter((l: any) => inPeriod(l.delivery_date || l.pickup_date));
  };

  const getFilteredExpenses = () => {
    let filtered = expenses;
    if (selectedTruck !== 'all') filtered = filtered.filter((e: Expense) => e.truck_id === selectedTruck);
    return filtered.filter((e: Expense) => inPeriod(e.expense_date));
  };

  const getFilteredPayrolls = () => payrolls.filter((p: DriverPayroll) => inPeriod(p.period_end));

  const getFilteredCommissions = () => commissions.filter((c: AgentCommission) => inPeriod(c.payout_date));

  const filteredLoads = getFilteredLoads();
  const deliveredLoads = filteredLoads.filter((l: any) => l.status === 'delivered');
  const filteredExpenses = getFilteredExpenses();
  const filteredPayrolls = getFilteredPayrolls();
  const filteredCommissions = getFilteredCommissions();

  // ===== SORT EXPENSES =====
  const sortedFilteredExpenses = [...filteredExpenses].sort((a, b) => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'expense_date':
        if (!a.expense_date && !b.expense_date) return 0;
        if (!a.expense_date) return 1;
        if (!b.expense_date) return -1;
        return direction * (parseISO(a.expense_date).getTime() - parseISO(b.expense_date).getTime());
      case 'expense_type':
        return direction * (a.expense_type || '').localeCompare(b.expense_type || '');
      case 'description':
        return direction * (a.description || '').localeCompare(b.description || '');
      case 'amount':
        return direction * ((a.amount || 0) - (b.amount || 0));
      case 'gallons':
        return direction * ((a.gallons || 0) - (b.gallons || 0));
      case 'truck_id':
        return direction * getTruckName(a.truck_id).localeCompare(getTruckName(b.truck_id));
      case 'load_id':
        return direction * getLoadName(a.load_id).localeCompare(getLoadName(b.load_id));
      default:
        return 0;
    }
  });

  // ===== CALCULATIONS =====
  const sortedLoads = [...deliveredLoads]
    .filter((l: any) => l.pickup_date && l.start_miles != null && l.end_miles != null)
    .sort((a: any, b: any) => parseISO(a.pickup_date).getTime() - parseISO(b.pickup_date).getTime());

  let deadheadMiles = 0;
  for (let i = 1; i < sortedLoads.length; i++) {
    const start = sortedLoads[i].start_miles;
    const prevEnd = sortedLoads[i - 1].end_miles;
    if (start == null || prevEnd == null) continue;
    const gap = start - prevEnd;
    if (gap > 0) deadheadMiles += gap;
  }

  const revenueTotals = deliveredLoads.reduce((acc: any, load: any) => ({
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

  const perLoadEmptyMiles = revenueTotals.actualMiles - revenueTotals.bookedMiles;
  const totalEmptyMiles = deadheadMiles + Math.max(0, perLoadEmptyMiles);
  const totalActualMilesWithDeadhead = revenueTotals.actualMiles + deadheadMiles;

  const loadIds = filteredLoads.map((l: any) => l.id);
  const filteredLoadExpenses = loadExpenses.filter((e: any) => loadIds.includes(e.load_id));
  
  const loadExpenseTotals = filteredLoadExpenses.reduce((acc: any, exp: any) => ({
    fuelCost: acc.fuelCost + (exp.fuel_cost || 0),
    truckPayment: acc.truckPayment + (exp.truck_payment || 0),
    operatingTotal: acc.operatingTotal + (exp.operating_total || 0),
  }), { fuelCost: 0, truckPayment: 0, operatingTotal: 0 });

  const TRUCK_LOAN_TYPE = 'Truck Loan';
  const filteredTruckPayments = filterByPeriod(truckLoanPayments, 'payment_date');
  const truckPaymentsTotal = filteredTruckPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const standaloneExpenses = filteredExpenses.filter((e: Expense) => !e.load_id && e.expense_type !== TRUCK_LOAN_TYPE);
  const loadLinkedExpenses = filteredExpenses.filter((e: Expense) => e.load_id && loadIds.includes(e.load_id));

  // Split into actual / advance / credit buckets
  const actualStandaloneExpenses = standaloneExpenses.filter(isActualExpense);
  const advanceExpenses = filteredExpenses.filter(isAdvanceExpense);
  const creditExpenses = filteredExpenses.filter(isCreditExpense);
  const actualLoadLinkedExpenses = loadLinkedExpenses.filter(isActualExpense);

  const standaloneExpenseTotals = actualStandaloneExpenses.reduce((acc: any, exp: Expense) => {
    acc.total += Number(exp.amount) || 0;
    acc.byType[exp.expense_type] = (acc.byType[exp.expense_type] || 0) + (Number(exp.amount) || 0);
    if (exp.gallons) acc.gallonsByType[exp.expense_type] = (acc.gallonsByType[exp.expense_type] || 0) + (Number(exp.gallons) || 0);
    return acc;
  }, { total: 0, byType: {}, gallonsByType: {} });

  const loadLinkedExpenseTotals = actualLoadLinkedExpenses.reduce((acc: any, exp: Expense) => {
    acc.total += Number(exp.amount) || 0;
    acc.byType[exp.expense_type] = (acc.byType[exp.expense_type] || 0) + (Number(exp.amount) || 0);
    if (exp.gallons) acc.gallonsByType[exp.expense_type] = (acc.gallonsByType[exp.expense_type] || 0) + (Number(exp.gallons) || 0);
    return acc;
  }, { total: 0, byType: {}, gallonsByType: {} });

  const advancesTotal = advanceExpenses.reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);
  const creditsTotal = creditExpenses.reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

  const payrollTotals = filteredPayrolls.reduce((acc: any, p: DriverPayroll) => ({
    count: acc.count + 1,
    grossPay: acc.grossPay + (p.gross_pay || 0),
    netPay: acc.netPay + (p.net_pay || 0),
    fuelDeductions: acc.fuelDeductions + (p.fuel_deductions || 0),
    repairDeductions: acc.repairDeductions + (p.repair_deductions || 0),
    otherDeductions: acc.otherDeductions + (p.other_deductions || 0),
  }), { count: 0, grossPay: 0, netPay: 0, fuelDeductions: 0, repairDeductions: 0, otherDeductions: 0 });

  const commissionTotals = filteredCommissions.reduce((acc: any, c: AgentCommission) => ({
    count: acc.count + 1,
    amount: acc.amount + (c.commission_amount || 0),
  }), { count: 0, amount: 0 });

  const totalExpenses = loadExpenseTotals.operatingTotal + standaloneExpenseTotals.total + loadLinkedExpenseTotals.total + truckPaymentsTotal - creditsTotal;
  const grossExpenses = loadExpenseTotals.operatingTotal + standaloneExpenseTotals.total + loadLinkedExpenseTotals.total + truckPaymentsTotal;
  // Driver pay: approved or paid settlement statements (gross pay plus reimbursements) and W-2 payroll batches.
  const driverPay = driverPayTotals(
    driverSettlements.filter((st: any) => inPeriod(st.period_end)),
    filteredPayrolls,
    safetyBonuses.filter((b: any) => inPeriod(b.period_end)),
  );
  const totalPayroll = driverPay.total;
  const totalRevenueWithCommissions = revenueTotals.netRevenue + commissionTotals.amount;
  const netProfit = totalRevenueWithCommissions - totalExpenses - totalPayroll;
  const profitMargin = totalRevenueWithCommissions > 0 ? (netProfit / totalRevenueWithCommissions) * 100 : 0;

  // ===== EXPENSE DIALOG HANDLERS =====
  const openExpenseDialog = (expense?: Expense) => {
    setEditingExpense(expense || null);
    setExpenseFormData(expense || { expense_type: 'Fuel' });
    setExpenseDialogOpen(true);
  };
  const closeExpenseDialog = () => { setExpenseDialogOpen(false); setEditingExpense(null); setExpenseFormData({}); };

  // Auto-open dialog from command palette quick action
  useEffect(() => {
    if (searchParams.get('action') === 'new-expense') {
      openExpenseDialog();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseFormData.expense_type || !expenseFormData.amount) { toast.error('Please fill in required fields'); return; }
    if (editingExpense) {
      updateExpenseMutation.mutate({ id: editingExpense.id, ...expenseFormData });
    } else {
      createExpenseMutation.mutate(expenseFormData as ExpenseInsert);
    }
  };

  const toggleExpenseSelection = (id: string) => {
    setSelectedExpenseIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleSelectAllExpenses = () => {
    setSelectedExpenseIds(selectedExpenseIds.size === sortedFilteredExpenses.length ? new Set() : new Set(sortedFilteredExpenses.map(e => e.id)));
  };
  const selectExpensesByType = (type: string) => {
    setSelectedExpenseIds(new Set(sortedFilteredExpenses.filter(e => e.expense_type === type).map(e => e.id)));
  };
  const closeMassEditDialog = () => { setMassEditDialogOpen(false); setMassEditFormData({}); };

  const handleMassEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<ExpenseInsert> = {};
    if (massEditFormData.expense_type) updates.expense_type = massEditFormData.expense_type;
    if (massEditFormData.expense_date) updates.expense_date = massEditFormData.expense_date;
    if (massEditFormData.truck_id !== undefined) updates.truck_id = massEditFormData.truck_id || null;
    if (massEditFormData.load_id !== undefined) updates.load_id = massEditFormData.load_id || null;
    if (massEditFormData.description !== undefined) updates.description = massEditFormData.description;
    if (Object.keys(updates).length === 0) { toast.error('Please select at least one field to update'); return; }
    massUpdateExpensesMutation.mutate(updates);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDirection('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };


  // Period and truck pickers. The period applies to Profit & loss and Expenses; the settlement tab has its own week.
  const renderFilters = (showTruck = true) => (
      <div className="grid grid-cols-2 gap-2 mb-4 sm:flex sm:flex-wrap sm:gap-3">
        <Select value={selectedPeriod} onValueChange={(v) => { setSelectedPeriod(v); setExpensePage(0); }}>
          <SelectTrigger className="h-11 sm:h-10 sm:w-48" aria-label="Period"><SelectValue placeholder="Select period" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This settlement week</SelectItem>
            <SelectItem value="all">All time</SelectItem>
            {(() => {
              // Dynamically generate periods from data
              const dates: Date[] = [];
              expenses.forEach(e => { if (e.expense_date) dates.push(parseISO(e.expense_date)); });
              loads.forEach((l: any) => { if (l.pickup_date) dates.push(parseISO(l.pickup_date)); });
              if (dates.length === 0) dates.push(new Date());
              const minDate = startOfMonth(new Date(Math.min(...dates.map(d => d.getTime()))));
              const maxDate = startOfMonth(new Date(Math.max(...dates.map(d => d.getTime()), Date.now())));
              
              const periods: { value: string; label: string }[] = [];
              // Quarters
              let qStart = startOfQuarter(minDate);
              const qEnd = startOfQuarter(maxDate);
              while (qStart <= qEnd) {
                const q = Math.floor(qStart.getMonth() / 3) + 1;
                periods.push({ value: `${qStart.getFullYear()}-Q${q}`, label: `Q${q} ${qStart.getFullYear()}` });
                qStart = addMonths(qStart, 3);
              }
              // Months
              let mStart = new Date(minDate);
              while (mStart <= maxDate) {
                periods.push({ value: `${mStart.getFullYear()}-${mStart.getMonth() + 1}`, label: format(mStart, 'MMMM yyyy') });
                mStart = addMonths(mStart, 1);
              }
              return periods.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>);
            })()}
          </SelectContent>
        </Select>
        {showTruck && (
          <Select value={selectedTruck} onValueChange={setSelectedTruck}>
            <SelectTrigger className="h-11 sm:h-10 sm:w-56" aria-label="Truck">
              <TruckIcon className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Select truck" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Units (Company)</SelectItem>
              {trucks.map((truck: any) => (
                <SelectItem key={truck.id} value={truck.id}>Unit #{truck.unit_number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
  );

  const VIEWS = ['settlement', 'overview', 'pnl', 'expenses', 'payroll', 'settings'];
  // Old links used these names; keep them working.
  const VIEW_ALIASES: Record<string, string> = { payouts: 'payroll', compliance: 'expenses', analytics: 'pnl', settlements: 'settlement', 'inhouse-payroll': 'payroll' };
  const rawView = searchParams.get('view') ?? searchParams.get('tab') ?? 'settlement';
  const view = VIEWS.includes(rawView) ? rawView : (VIEW_ALIASES[rawView] ?? 'settlement');

  return (
    <>
      <PageHeader
        title="Money"
        description="Revenue, expenses, and Landstar settlements"
      >
        <Button
          variant="outline"
          onClick={() => setUploadDialogOpen(true)}
          className="h-11 sm:h-10 w-full sm:w-auto"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Statement
        </Button>
      </PageHeader>

      <Tabs
        value={view}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          next.delete('tab');
          next.set('view', v);
          setSearchParams(next, { replace: true });
        }}
        className="w-full"
      >
        <TabsList className="mb-5 h-auto w-full justify-start gap-1 overflow-x-auto bg-muted p-1">
          {([
            ['settlement', 'Settlement'],
            ['overview', 'Overview'],
            ['pnl', 'Profit & loss'],
            ['expenses', 'Expenses'],
            ['payroll', 'Payroll'],
            ['settings', 'Settings'],
          ] as const).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="h-11 shrink-0 px-4 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ===== SETTLEMENT: the weekly Landstar statement ===== */}
        <TabsContent value="settlement">
          <div className="animate-in fade-in-50">
            {trucks.length > 1 && (
              <div className="mb-4">
                <Select value={selectedTruck} onValueChange={setSelectedTruck}>
                  <SelectTrigger className="h-11 sm:h-10 sm:w-56" aria-label="Truck">
                    <TruckIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Select truck" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Units (Company)</SelectItem>
                    {trucks.map((truck: any) => (
                      <SelectItem key={truck.id} value={truck.id}>Unit #{truck.unit_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <SettlementStatementTab
              loads={loads as any}
              expenses={expenses as any}
              truckId={selectedTruck}
              isLoading={loadsLoading || expensesLoading}
              onUpload={() => setUploadDialogOpen(true)}
            />
            <div className="mt-5">
              <YearToDateCheck loads={loads as any} />
            </div>
            <div className="mt-5">
              <TrueUpLoads getSetting={getSetting} />
            </div>
            <div className="mt-5">
              <WeeklyProof getSetting={getSetting} onTick={(ids) => setSelectedExpenseIds((prev) => new Set([...prev, ...ids]))} />
            </div>
            <div className="mt-5">
              <YearLedger />
            </div>
          </div>
        </TabsContent>

        {/* ===== OVERVIEW: the all-in rate and the year against last year ===== */}
        <TabsContent value="overview">
          <div className="animate-in fade-in-50">
            <RevenueOverview />
          </div>
        </TabsContent>

        {/* ===== PROFIT & LOSS ===== */}
        <TabsContent value="pnl">
          <div className="space-y-8 animate-in fade-in-50">
            {renderFilters()}
            <PLSummaryTab
              revenueTotals={revenueTotals}
              loadExpenseTotals={loadExpenseTotals}
              standaloneExpenseTotals={standaloneExpenseTotals}
              loadLinkedExpenseTotals={loadLinkedExpenseTotals}
              payrollTotals={payrollTotals}
              driverPay={driverPay}
              commissionTotals={commissionTotals}
              deadheadMiles={deadheadMiles}
              totalEmptyMiles={totalEmptyMiles}
              totalActualMilesWithDeadhead={totalActualMilesWithDeadhead}
              netProfit={netProfit}
              profitMargin={profitMargin}
              totalExpenses={totalExpenses}
              totalRevenueWithCommissions={totalRevenueWithCommissions}
              fuel={fuelStats(filteredExpenses)}
              truckPaymentsTotal={truckPaymentsTotal}
              advancesTotal={advancesTotal}
              creditsTotal={creditsTotal}
              getSetting={getSetting}
            />
            <Suspense fallback={<ChartSkeleton height={320} />}>
              <RevenueTab filteredLoads={filteredLoads} revenueTotals={revenueTotals} />
            </Suspense>
            <Suspense fallback={<ChartSkeleton height={320} />}>
              <LoadProfitabilityTab
                deliveredLoads={deliveredLoads}
                loadExpenses={loadExpenses}
                drivers={drivers}
                expenses={filteredExpenses}
                totalExpenses={totalExpenses}
                totalPayroll={totalPayroll}
                revenueTotals={revenueTotals}
                allLoads={loads}
                isIndependent={isIndependent}
              />
            </Suspense>
          </div>
        </TabsContent>

        {/* ===== EXPENSES ===== */}
        <TabsContent value="expenses">
          <PossibleDuplicates
            expenses={expenses}
            loads={loads}
            selectedIds={selectedExpenseIds}
            onSelect={(ids) => setSelectedExpenseIds((prev) => new Set([...prev, ...ids]))}
          />
          <ImportedLinesToCheck
            expenses={expenses.filter((e: any) => !e.deleted_at)}
            selectedIds={selectedExpenseIds}
            onSelect={(ids) => setSelectedExpenseIds((prev) => new Set([...prev, ...ids]))}
          />
          {renderFilters()}
          <div className="animate-in fade-in-50">
            <ExpenseSummary
              standalone={standaloneExpenseTotals}
              loadLinked={loadLinkedExpenseTotals}
              legacyOperating={loadExpenseTotals.operatingTotal}
              truckPayments={truckPaymentsTotal}
              credits={creditExpenses}
              creditsTotal={creditsTotal}
              advances={advanceExpenses}
              advancesTotal={advancesTotal}
              netCosts={totalExpenses}
            />
            <ExpensesList
              rows={sortedFilteredExpenses.slice(expensePage * EXPENSES_PER_PAGE, (expensePage + 1) * EXPENSES_PER_PAGE)}
              totalCount={sortedFilteredExpenses.length}
              page={expensePage}
              pageSize={EXPENSES_PER_PAGE}
              onPage={setExpensePage}
              selectedIds={selectedExpenseIds}
              allSelected={sortedFilteredExpenses.length > 0 && selectedExpenseIds.size === sortedFilteredExpenses.length}
              onToggle={toggleExpenseSelection}
              onToggleAll={toggleSelectAllExpenses}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              typeOptions={[...new Set(sortedFilteredExpenses.map((e) => e.expense_type))].sort().map((type) => ({
                type,
                count: sortedFilteredExpenses.filter((e) => e.expense_type === type).length,
              }))}
              onSelectByType={selectExpensesByType}
              truckName={getTruckName}
              loadName={getLoadName}
              onAdd={() => openExpenseDialog()}
              onEdit={(expense) => openExpenseDialog(expense)}
              onDelete={(id) => setDeleteConfirmId(id)}
              onBulkEdit={() => { setMassEditFormData({}); setMassEditDialogOpen(true); }}
              onBulkDelete={() => setMassDeleteDialogOpen(true)}
            />
          </div>
        </TabsContent>

        {/* ===== PAYROLL: W-2 batch, contractor settlements, agent commissions, safety bonuses ===== */}
        <TabsContent value="payroll">
          <div className="animate-in fade-in-50 space-y-5">
            {renderFilters(false)}

            <Panel title="Payroll this period" description="What your drivers cost, and what you earn as the agency.">
              <StatementLine
                label="Driver pay"
                note={
                  driverPay.total > 0
                    ? [
                        driverPay.settlementCount > 0 ? `${driverPay.settlementCount} approved or paid settlement${driverPay.settlementCount === 1 ? '' : 's'}` : '',
                        driverPay.batchCount > 0 ? `${driverPay.batchCount} payroll batch${driverPay.batchCount === 1 ? '' : 'es'}` : '',
                        driverPay.bonusCount > 0 ? `${driverPay.bonusCount} safety bonus${driverPay.bonusCount === 1 ? '' : 'es'}` : '',
                        revenueTotals.netRevenue > 0 ? `${Math.round((driverPay.total / revenueTotals.netRevenue) * 100)}% of your revenue` : '',
                      ].filter(Boolean).join(', ')
                    : 'No approved or paid settlements or bonuses in this period'
                }
                value={driverPay.total > 0 ? `−${formatCurrency(driverPay.total)}` : 'None yet'}
                muted
              />
              <StatementLine
                label="Agent commissions"
                note={commissionTotals.count > 0 ? `${commissionTotals.count} earned, counted as revenue` : 'None earned in this period'}
                value={commissionTotals.count > 0 ? `+${formatCurrency(commissionTotals.amount)}` : 'None yet'}
                rule="single"
              />
            </Panel>

            <DriverSettlementsTab />

            <CommissionsTab
              filteredCommissions={filteredCommissions}
              commissionTotals={commissionTotals}
              commissionsLoading={commissionsLoading}
            />

            <SafetyBonusPayouts />

            {canManagePayroll && (
              payrolls.length > 0 || showW2Batch ? (
                <section>
                  <ActiveBatchTab />
                </section>
              ) : (
                <Panel
                  title="W-2 payroll batch"
                  description="Weekly payroll with tax withholding for W-2 employees."
                  aside={
                    <Button variant="outline" className="h-11" onClick={() => setShowW2Batch(true)}>Open batch tools</Button>
                  }
                >
                  <p className="pb-2 text-sm text-muted-foreground">
                    No W-2 payroll has been run yet, so there is nothing to show. Open the tools when you want to run a batch.
                  </p>
                </Panel>
              )
            )}
          </div>
        </TabsContent>

        {/* ===== SETTINGS: pay rules, audit, invoicing ===== */}
        <TabsContent value="settings">
          <div className="space-y-8 animate-in fade-in-50">
            <CompensationSettingsTab getSetting={getSetting} />
            {isIndependent && (
              <>
                <InvoicingTab />
                <FactoringTab />
              </>
            )}
            <SafetyBonusSettings />
          </div>
        </TabsContent>
      </Tabs>


      {/* Upload Statement Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload Statement</DialogTitle>
          </DialogHeader>
          <Suspense fallback={<DialogSkeleton />}>
            <StatementUpload
              existingLoads={loads.map((l: any) => ({ id: l.id, landstar_load_id: l.landstar_load_id, origin: l.origin, destination: l.destination, rate: l.rate, net_revenue: l.net_revenue, delivery_date: l.delivery_date, truck_id: l.truck_id }))}
              trucks={trucks.map((t: any) => ({ id: t.id, unit_number: t.unit_number }))}
              existingExpenses={expenses.filter((e: any) => !e.deleted_at).map((e: any) => ({ id: e.id, expense_date: e.expense_date, expense_type: e.expense_type, amount: e.amount, load_id: e.load_id, description: e.description }))}
              onExpensesImported={() => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setUploadDialogOpen(false); }}
              orgId={orgId}
            />
          </Suspense>
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle></DialogHeader>
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={expenseFormData.expense_date || ''} onChange={(e) => setExpenseFormData({ ...expenseFormData, expense_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={expenseFormData.expense_type || 'Fuel'} onValueChange={(v) => setExpenseFormData({ ...expenseFormData, expense_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount ($) *</Label>
                <Input type="number" step="0.01" value={expenseFormData.amount || ''} onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: parseFloat(e.target.value) || 0 })} required />
              </div>
              {GALLONS_EXPENSE_TYPES.includes(expenseFormData.expense_type || '') && (
                <div className="space-y-2">
                  <Label>Gallons</Label>
                  <Input type="number" step="0.01" value={expenseFormData.gallons || ''} onChange={(e) => setExpenseFormData({ ...expenseFormData, gallons: parseFloat(e.target.value) || undefined })} />
                </div>
              )}
              {GALLONS_EXPENSE_TYPES.includes(expenseFormData.expense_type || '') && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><MapPin className="h-3 w-3" /> State (IFTA)</Label>
                  <Select value={(expenseFormData as any).jurisdiction || 'none'} onValueChange={(v) => setExpenseFormData({ ...expenseFormData, jurisdiction: v === 'none' ? null : v } as any)}>
                    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={expenseFormData.description || ''} onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input value={expenseFormData.vendor || ''} onChange={(e) => setExpenseFormData({ ...expenseFormData, vendor: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Link to Truck</Label>
                <Select value={expenseFormData.truck_id || 'none'} onValueChange={(v) => setExpenseFormData({ ...expenseFormData, truck_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {trucks.map((truck: any) => <SelectItem key={truck.id} value={truck.id}>{truck.unit_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Link to Load</Label>
                <Select value={expenseFormData.load_id || 'none'} onValueChange={(v) => setExpenseFormData({ ...expenseFormData, load_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {loads.slice(0, 20).map((load: any) => <SelectItem key={load.id} value={load.id}>{load.landstar_load_id || `${load.origin} → ${load.destination}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={expenseFormData.notes || ''} onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeExpenseDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">{editingExpense ? 'Save Changes' : 'Add Expense'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mass Edit Dialog */}
      <Dialog open={massEditDialogOpen} onOpenChange={setMassEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckSquare className="h-5 w-5" /> Edit {selectedExpenseIds.size} Expenses</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMassEditSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">Only fill in the fields you want to update. Empty fields will not be changed.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expense Type</Label>
                <Select value={massEditFormData.expense_type || ''} onValueChange={(v) => setMassEditFormData({ ...massEditFormData, expense_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>{EXPENSE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={massEditFormData.expense_date || ''} onChange={(e) => setMassEditFormData({ ...massEditFormData, expense_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Truck</Label>
                <Select value={massEditFormData.truck_id || 'keep'} onValueChange={(v) => setMassEditFormData({ ...massEditFormData, truck_id: v === 'keep' ? undefined : (v === 'none' ? null : v) })}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep current</SelectItem>
                    <SelectItem value="none">No truck</SelectItem>
                    {trucks.map((truck: any) => <SelectItem key={truck.id} value={truck.id}>Unit #{truck.unit_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Load</Label>
                <Select value={massEditFormData.load_id || 'keep'} onValueChange={(v) => setMassEditFormData({ ...massEditFormData, load_id: v === 'keep' ? undefined : (v === 'none' ? null : v) })}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep current</SelectItem>
                    <SelectItem value="none">No load</SelectItem>
                    {loads.slice(0, 20).map((load: any) => <SelectItem key={load.id} value={load.id}>{load.landstar_load_id || `${load.origin} → ${load.destination}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={massEditFormData.description || ''} onChange={(e) => setMassEditFormData({ ...massEditFormData, description: e.target.value })} placeholder="Keep current" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeMassEditDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">Update {selectedExpenseIds.size} Expenses</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mass Delete Confirmation */}
      <ConfirmDeleteDialog
        open={massDeleteDialogOpen}
        onOpenChange={setMassDeleteDialogOpen}
        onConfirm={handleMassDelete}
        title={`Archive ${selectedExpenseIds.size} expenses`}
        description={`Archive ${selectedExpenseIds.size} selected expenses? They leave your totals and can be restored from the Archive page.`}
        isDeleting={isMassDeleting}
        confirmLabel="Archive"
      />

      {/* Single Delete Confirmation */}
      <ConfirmDeleteDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
        onConfirm={() => {
          if (deleteConfirmId) {
            deleteExpenseMutation.mutate(deleteConfirmId);
            setDeleteConfirmId(null);
          }
        }}
        title="Archive expense"
        description="Archive this expense? It leaves your totals and can be restored from the Archive page."
        isDeleting={deleteExpenseMutation.isPending}
        confirmLabel="Archive"
      />
    </>
  );
}
