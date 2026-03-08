import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
import { DollarSign, TrendingUp, TrendingDown, Percent, Receipt, PiggyBank, Calculator, Route, Pencil, Trash2, Plus, Fuel, Truck as TruckIcon, Users, Briefcase, CheckSquare, ArrowUpDown, ArrowUp, ArrowDown, MapPin, Banknote, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { StatementUpload } from '@/components/finance/StatementUpload';
import { AuditReconciliation } from '@/components/finance/AuditReconciliation';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { SettlementsTab } from '@/components/finance/SettlementsTab';
import { PLSummaryTab } from '@/components/finance/PLSummaryTab';
import { RevenueTab } from '@/components/finance/RevenueTab';
import { PayrollTab } from '@/components/finance/PayrollTab';
import { CommissionsTab } from '@/components/finance/CommissionsTab';
import { CompensationSettingsTab } from '@/components/finance/CompensationSettingsTab';
import { format, parseISO, endOfMonth, endOfQuarter, isWithinInterval, startOfMonth, startOfQuarter, subMonths, addMonths } from 'date-fns';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';
import { US_STATES } from '@/lib/us-states';

type Expense = Database['public']['Tables']['expenses']['Row'];
type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
type DriverPayroll = Database['public']['Tables']['driver_payroll']['Row'];
type AgentCommission = Database['public']['Tables']['agent_commissions']['Row'];

const expenseTypes = [
  'Fuel', 'DEF', 'Fuel Discount', 'Reimbursement', 'Truck Payment', 'Trailer Payment',
  'Licensing/Permits', 'Registration/Plates', 'Insurance', 'LCN/Satellite', 'Maintenance',
  'Cell Phone', 'Trip Scanning', 'Card Load', 'Card Fee', 'Cash Advance', 'Direct Deposit Fee',
  'Advance', 'Direct Deposit',
  'Escrow Payment', 'Truck Warranty', 'CPP/Benefits', 'IFTA', 'PrePass/Scale', 'Tolls', 'Parking', 'Misc'
];

const GALLONS_EXPENSE_TYPES = ['Fuel', 'DEF'];

// Advance types are non-P&L (early access to funds, not true expenses)
const ADVANCE_EXPENSE_TYPES = ['Advance', 'Cash Advance', 'Card Load', 'Direct Deposit'];

// Credit types offset expenses (money coming back)
const CREDIT_EXPENSE_TYPES = ['Reimbursement', 'Fuel Discount'];

const isAdvanceExpense = (expense: Expense): boolean => {
  return ADVANCE_EXPENSE_TYPES.includes(expense.expense_type) ||
    (expense.notes?.includes('Advance (Non-P&L)') ?? false);
};

const isCreditExpense = (expense: Expense): boolean => {
  return CREDIT_EXPENSE_TYPES.includes(expense.expense_type) || expense.amount < 0;
};

const isActualExpense = (expense: Expense): boolean => {
  return !isAdvanceExpense(expense) && !isCreditExpense(expense);
};

export default function Finance() {
  const queryClient = useQueryClient();
  const { orgId } = useAuth();
  // Default to current month
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const [selectedPeriod, setSelectedPeriod] = useState<string>(defaultPeriod);
  const [selectedTruck, setSelectedTruck] = useState<string>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
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

  const { data: expenses = [] } = useQuery({
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

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: payrolls = [], isLoading: payrollsLoading } = useQuery({
    queryKey: ['driver_payroll'],
    queryFn: async () => {
      const { data, error } = await supabase.from('driver_payroll').select('*').order('period_end', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: commissions = [], isLoading: commissionsLoading } = useQuery({
    queryKey: ['agent_commissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agent_commissions').select('*').order('created_at', { ascending: false });
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
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense deleted'); },
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
      const { error } = await supabase.from('expenses').delete().in('id', ids);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(`${ids.length} expenses deleted`);
      setSelectedExpenseIds(new Set());
      setMassDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete expenses');
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
  const filterByPeriod = <T extends Record<string, any>>(items: T[], dateField: string): T[] => {
    let filtered = items;
    if (selectedTruck !== 'all' && 'truck_id' in (filtered[0] || {})) {
      filtered = filtered.filter((item) => (item as any).truck_id === selectedTruck);
    }
    if (selectedPeriod === 'all') return filtered;
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    if (period.startsWith('Q')) {
      const quarter = parseInt(period.substring(1));
      const startMonth = (quarter - 1) * 3;
      const start = new Date(yearNum, startMonth, 1);
      const end = endOfQuarter(start);
      return filtered.filter((item) => {
        if (!item[dateField]) return false;
        const date = parseISO(item[dateField]);
        return isWithinInterval(date, { start, end });
      });
    } else {
      const month = parseInt(period) - 1;
      const start = new Date(yearNum, month, 1);
      const end = endOfMonth(start);
      return filtered.filter((item) => {
        if (!item[dateField]) return false;
        const date = parseISO(item[dateField]);
        return isWithinInterval(date, { start, end });
      });
    }
  };

  const getFilteredLoads = () => {
    let filtered = loads;
    if (selectedTruck !== 'all') filtered = filtered.filter((l: any) => l.truck_id === selectedTruck);
    if (selectedPeriod === 'all') return filtered;
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    if (period.startsWith('Q')) {
      const quarter = parseInt(period.substring(1));
      const startMonth = (quarter - 1) * 3;
      const start = new Date(yearNum, startMonth, 1);
      const end = endOfQuarter(start);
      return filtered.filter((l: any) => l.pickup_date && isWithinInterval(parseISO(l.pickup_date), { start, end }));
    } else {
      const month = parseInt(period) - 1;
      const start = new Date(yearNum, month, 1);
      const end = endOfMonth(start);
      return filtered.filter((l: any) => l.pickup_date && isWithinInterval(parseISO(l.pickup_date), { start, end }));
    }
  };

  const getFilteredExpenses = () => {
    let filtered = expenses;
    if (selectedTruck !== 'all') filtered = filtered.filter((e: Expense) => e.truck_id === selectedTruck);
    if (selectedPeriod === 'all') return filtered;
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    if (period.startsWith('Q')) {
      const quarter = parseInt(period.substring(1));
      const startMonth = (quarter - 1) * 3;
      const start = new Date(yearNum, startMonth, 1);
      const end = endOfQuarter(start);
      return filtered.filter((e: Expense) => e.expense_date && isWithinInterval(parseISO(e.expense_date), { start, end }));
    } else {
      const month = parseInt(period) - 1;
      const start = new Date(yearNum, month, 1);
      const end = endOfMonth(start);
      return filtered.filter((e: Expense) => e.expense_date && isWithinInterval(parseISO(e.expense_date), { start, end }));
    }
  };

  const getFilteredPayrolls = () => {
    if (selectedPeriod === 'all') return payrolls;
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    if (period.startsWith('Q')) {
      const quarter = parseInt(period.substring(1));
      const startMonth = (quarter - 1) * 3;
      const start = new Date(yearNum, startMonth, 1);
      const end = endOfQuarter(start);
      return payrolls.filter((p: DriverPayroll) => p.period_end && isWithinInterval(parseISO(p.period_end), { start, end }));
    } else {
      const month = parseInt(period) - 1;
      const start = new Date(yearNum, month, 1);
      const end = endOfMonth(start);
      return payrolls.filter((p: DriverPayroll) => p.period_end && isWithinInterval(parseISO(p.period_end), { start, end }));
    }
  };

  const getFilteredCommissions = () => {
    if (selectedPeriod === 'all') return commissions;
    const [year, period] = selectedPeriod.split('-');
    const yearNum = parseInt(year);
    if (period.startsWith('Q')) {
      const quarter = parseInt(period.substring(1));
      const startMonth = (quarter - 1) * 3;
      const start = new Date(yearNum, startMonth, 1);
      const end = endOfQuarter(start);
      return commissions.filter((c: AgentCommission) => c.payout_date && isWithinInterval(parseISO(c.payout_date), { start, end }));
    } else {
      const month = parseInt(period) - 1;
      const start = new Date(yearNum, month, 1);
      const end = endOfMonth(start);
      return commissions.filter((c: AgentCommission) => c.payout_date && isWithinInterval(parseISO(c.payout_date), { start, end }));
    }
  };

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
    const gap = sortedLoads[i].start_miles - sortedLoads[i - 1].end_miles;
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

  const standaloneExpenses = filteredExpenses.filter((e: Expense) => !e.load_id);
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

  const totalExpenses = loadExpenseTotals.operatingTotal + standaloneExpenseTotals.total + loadLinkedExpenseTotals.total - creditsTotal;
  const grossExpenses = loadExpenseTotals.operatingTotal + standaloneExpenseTotals.total + loadLinkedExpenseTotals.total;
  const totalPayroll = payrollTotals.netPay;
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


  return (
    <>
      <PageHeader title="Finance & P/L" description="Track revenue, expenses, and profitability" />

      {/* Period and Truck Selector */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select value={selectedPeriod} onValueChange={(v) => { setSelectedPeriod(v); setExpensePage(0); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Select period" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
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
        <Select value={selectedTruck} onValueChange={setSelectedTruck}>
          <SelectTrigger className="w-56">
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCurrency(revenueTotals.netRevenue)}</div>
            <p className="text-xs text-muted-foreground">{revenueTotals.loadCount} loads · Gross: {formatCurrency(revenueTotals.grossRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses + totalPayroll)}</div>
            <p className="text-xs text-muted-foreground">
              Operating + Payroll {creditsTotal > 0 && <span className="text-success">· Credits: -{formatCurrency(creditsTotal)}</span>}
            </p>
            {advancesTotal > 0 && (
              <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                <Banknote className="h-3 w-3" /> Advances: {formatCurrency(advancesTotal)} (non-P&L)
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <PiggyBank className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(netProfit)}</div>
            <p className="text-xs text-muted-foreground">Margin: {profitMargin.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pl" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="pl">P&L Summary</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="pl" className="mt-6">
          <PLSummaryTab
            revenueTotals={revenueTotals}
            loadExpenseTotals={loadExpenseTotals}
            standaloneExpenseTotals={standaloneExpenseTotals}
            loadLinkedExpenseTotals={loadLinkedExpenseTotals}
            payrollTotals={payrollTotals}
            commissionTotals={commissionTotals}
            deadheadMiles={deadheadMiles}
            totalEmptyMiles={totalEmptyMiles}
            totalActualMilesWithDeadhead={totalActualMilesWithDeadhead}
            netProfit={netProfit}
            profitMargin={profitMargin}
            totalExpenses={totalExpenses}
            totalRevenueWithCommissions={totalRevenueWithCommissions}
            getSetting={getSetting}
          />
        </TabsContent>

        <TabsContent value="revenue" className="mt-6">
          <RevenueTab filteredLoads={filteredLoads} revenueTotals={revenueTotals} />
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <AuditReconciliation loads={loads} />
          <StatementUpload 
            existingLoads={loads.map((l: any) => ({ id: l.id, landstar_load_id: l.landstar_load_id, origin: l.origin, destination: l.destination }))}
            trucks={trucks.map((t: any) => ({ id: t.id, unit_number: t.unit_number }))}
            existingExpenses={expenses.map((e: any) => ({ id: e.id, expense_date: e.expense_date, expense_type: e.expense_type, amount: e.amount, load_id: e.load_id }))}
            onExpensesImported={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })}
            orgId={orgId}
          />

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Manage Expenses</CardTitle>
                <CardDescription>Track expenses by type, optionally link to a load or truck</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select onValueChange={selectExpensesByType}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Select by type" /></SelectTrigger>
                  <SelectContent>
                    {expenseTypes.filter(type => sortedFilteredExpenses.some(e => e.expense_type === type)).map(type => {
                      const count = sortedFilteredExpenses.filter(e => e.expense_type === type).length;
                      return <SelectItem key={type} value={type}>{type} ({count})</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                {selectedExpenseIds.size > 0 && (
                  <>
                    <Button variant="outline" onClick={() => { setMassEditFormData({}); setMassEditDialogOpen(true); }}>
                      <CheckSquare className="h-4 w-4 mr-2" /> Edit {selectedExpenseIds.size} Selected
                    </Button>
                    <Button variant="destructive" onClick={() => setMassDeleteDialogOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete {selectedExpenseIds.size} Selected
                    </Button>
                  </>
                )}
                <Button onClick={() => openExpenseDialog()} className="gradient-gold text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" /> Add Expense
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox checked={sortedFilteredExpenses.length > 0 && selectedExpenseIds.size === sortedFilteredExpenses.length} onCheckedChange={toggleSelectAllExpenses} />
                      </TableHead>
                      {(['expense_date', 'expense_type', 'description', 'amount', 'gallons', 'truck_id', 'load_id'] as SortField[]).map(field => (
                        <TableHead key={field} className="cursor-pointer hover:bg-muted/80 select-none" onClick={() => handleSort(field)}>
                          <div className="flex items-center">
                            {{ expense_date: 'Date', expense_type: 'Type', description: 'Description', amount: 'Amount', gallons: 'Gallons', truck_id: 'Truck', load_id: 'Load' }[field]}
                            <SortIcon field={field} />
                          </div>
                        </TableHead>
                      ))}
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFilteredExpenses.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No expenses for this period</TableCell></TableRow>
                    ) : (
                      sortedFilteredExpenses.slice(expensePage * EXPENSES_PER_PAGE, (expensePage + 1) * EXPENSES_PER_PAGE).map((expense) => {
                        const isRefund = isCreditExpense(expense);
                        const isAdvance = isAdvanceExpense(expense);
                        const absAmount = Math.abs(Number(expense.amount));
                        return (
                          <TableRow key={expense.id} className={`${selectedExpenseIds.has(expense.id) ? 'bg-primary/5' : ''} ${isAdvance ? 'opacity-70' : ''}`}>
                            <TableCell><Checkbox checked={selectedExpenseIds.has(expense.id)} onCheckedChange={() => toggleExpenseSelection(expense.id)} /></TableCell>
                            <TableCell>{expense.expense_date ? format(parseISO(expense.expense_date), 'MM/dd/yyyy') : '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {isRefund && <TrendingUp className="h-4 w-4 text-success" />}
                                {isAdvance && <Banknote className="h-4 w-4 text-warning" />}
                                <span className={isRefund ? 'text-success font-medium' : isAdvance ? 'text-warning font-medium' : ''}>{expense.expense_type}</span>
                                {isAdvance && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning/30 text-warning">Non-P&L</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>{expense.description || '-'}</TableCell>
                            <TableCell>
                              <span className={`font-medium ${isRefund ? 'text-success' : isAdvance ? 'text-warning' : 'text-destructive'}`}>
                                {isRefund ? '+' : '-'}{formatCurrency(absAmount)}
                              </span>
                            </TableCell>
                            <TableCell>{expense.gallons ? `${expense.gallons} gal` : '-'}</TableCell>
                            <TableCell>{getTruckName(expense.truck_id)}</TableCell>
                            <TableCell>{getLoadName(expense.load_id)}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openExpenseDialog(expense)}>
                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirmId(expense.id)}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination Controls */}
              {sortedFilteredExpenses.length > EXPENSES_PER_PAGE && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {expensePage * EXPENSES_PER_PAGE + 1}–{Math.min((expensePage + 1) * EXPENSES_PER_PAGE, sortedFilteredExpenses.length)} of {sortedFilteredExpenses.length}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={expensePage === 0} onClick={() => setExpensePage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={(expensePage + 1) * EXPENSES_PER_PAGE >= sortedFilteredExpenses.length} onClick={() => setExpensePage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expense Breakdown Card */}
          <Card className="card-elevated mt-6">
            <CardHeader>
              <CardTitle>Expense Breakdown</CardTitle>
              <CardDescription>Summary by category for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3">Standalone Expenses</h4>
                  <Table>
                    <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {expenseTypes.map(type => {
                        const amount = standaloneExpenseTotals.byType[type] || 0;
                        const gallons = standaloneExpenseTotals.gallonsByType[type] || 0;
                        if (amount === 0) return null;
                        return (
                          <TableRow key={type}>
                            <TableCell className="flex items-center gap-2">
                              {(type === 'Fuel' || type === 'DEF') && <Fuel className="h-4 w-4" />}
                              {type}
                              {gallons > 0 && <span className="text-xs text-muted-foreground">({gallons.toFixed(1)} gal)</span>}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-warning/10">
                        <TableCell className="font-bold">Total Standalone</TableCell>
                        <TableCell className="text-right font-bold text-warning">{formatCurrency(standaloneExpenseTotals.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div>
                  <h4 className="font-semibold mb-3">Load-Linked Expenses</h4>
                  <Table>
                    <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {expenseTypes.map(type => {
                        const amount = loadLinkedExpenseTotals.byType[type] || 0;
                        if (amount === 0) return null;
                        return (
                          <TableRow key={type}>
                            <TableCell>{type}</TableCell>
                            <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {loadExpenseTotals.operatingTotal > 0 && (
                        <TableRow>
                          <TableCell>Operating (Legacy)</TableCell>
                          <TableCell className="text-right">{formatCurrency(loadExpenseTotals.operatingTotal)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-destructive/10">
                        <TableCell className="font-bold">Total Load-Linked</TableCell>
                        <TableCell className="text-right font-bold text-destructive">{formatCurrency(loadLinkedExpenseTotals.total + loadExpenseTotals.operatingTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Credits & Advances summary */}
              {(creditsTotal > 0 || advancesTotal > 0) && (
                <div className="grid md:grid-cols-2 gap-6 mt-6">
                  {creditsTotal > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 text-success">Credits & Reimbursements</h4>
                      <Table>
                        <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {creditExpenses.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="text-success">{e.expense_type}</TableCell>
                              <TableCell className="text-right text-success">+{formatCurrency(Math.abs(Number(e.amount)))}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-success/10">
                            <TableCell className="font-bold">Total Credits</TableCell>
                            <TableCell className="text-right font-bold text-success">+{formatCurrency(creditsTotal)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {advancesTotal > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 text-warning">Advances (Non-P&L)</h4>
                      <Table>
                        <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {advanceExpenses.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="text-warning">{e.expense_type}</TableCell>
                              <TableCell className="text-right text-warning">{formatCurrency(Math.abs(Number(e.amount)))}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-warning/10">
                            <TableCell className="font-bold">Total Advances</TableCell>
                            <TableCell className="text-right font-bold text-warning">{formatCurrency(advancesTotal)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Actual Expenses</span>
                  <span className="font-medium text-destructive">{formatCurrency(grossExpenses)}</span>
                </div>
                {creditsTotal > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Credits / Discounts</span>
                    <span className="font-medium text-success">-{formatCurrency(creditsTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-border pt-2">
                  <span className="font-bold text-lg">NET EXPENSE IMPACT</span>
                  <span className="font-bold text-2xl text-destructive">{formatCurrency(totalExpenses)}</span>
                </div>
                {advancesTotal > 0 && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-sm text-warning flex items-center gap-1"><Banknote className="h-3 w-3" /> Advances Taken (neutral)</span>
                    <span className="text-sm text-warning">{formatCurrency(advancesTotal)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="mt-6">
          <PayrollTab
            filteredPayrolls={filteredPayrolls}
            payrollTotals={payrollTotals}
            payrollsLoading={payrollsLoading}
            drivers={drivers}
            getDriverName={getDriverName}
          />
        </TabsContent>

        <TabsContent value="commissions" className="mt-6">
          <CommissionsTab
            filteredCommissions={filteredCommissions}
            commissionTotals={commissionTotals}
            commissionsLoading={commissionsLoading}
          />
        </TabsContent>

        <TabsContent value="settlements" className="mt-6">
          <SettlementsTab />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <CompensationSettingsTab getSetting={getSetting} />
        </TabsContent>
      </Tabs>

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
                  <SelectContent>{expenseTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
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
                  <SelectContent>{expenseTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
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
        title={`Delete ${selectedExpenseIds.size} Expenses`}
        description={`Are you sure you want to delete ${selectedExpenseIds.size} selected expenses? This action cannot be undone.`}
        isDeleting={isMassDeleting}
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
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        isDeleting={deleteExpenseMutation.isPending}
      />
    </>
  );
}
