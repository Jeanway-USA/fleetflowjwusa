import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, TrendingDown, Percent, Truck, Receipt, PiggyBank, Calculator } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, isWithinInterval } from 'date-fns';
import { useState } from 'react';

export default function Finance() {
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-Q1');
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<any>({});

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

  const { data: expenses = [] } = useQuery({
    queryKey: ['load_expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('load_expenses').select('*');
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

  const filteredLoads = getFilteredLoads();

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

  // Get expenses for filtered loads
  const loadIds = filteredLoads.map((l: any) => l.id);
  const filteredExpenses = expenses.filter((e: any) => loadIds.includes(e.load_id));
  
  const expenseTotals = filteredExpenses.reduce((acc: any, exp: any) => ({
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

  const netProfit = revenueTotals.netRevenue - expenseTotals.operatingTotal;
  const profitMargin = revenueTotals.netRevenue > 0 ? (netProfit / revenueTotals.netRevenue) * 100 : 0;

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
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCurrency(revenueTotals.netRevenue)}</div>
            <p className="text-xs text-muted-foreground">{revenueTotals.loadCount} loads</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Operating Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(expenseTotals.operatingTotal)}</div>
            <p className="text-xs text-muted-foreground">All operating costs</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            {netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">Revenue - Expenses</p>
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
        <TabsList>
          <TabsTrigger value="summary">P&L Summary</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Details</TabsTrigger>
          <TabsTrigger value="expenses">Expense Details</TabsTrigger>
          <TabsTrigger value="settings">Compensation Package</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6">
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
                      <TableCell>Booked Linehaul</TableCell>
                      <TableCell className="text-right">{formatCurrency(revenueTotals.bookedLinehaul)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Fuel Surcharge</TableCell>
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
                      <TableCell className="font-bold">Net Revenue</TableCell>
                      <TableCell className="text-right font-bold text-success">{formatCurrency(revenueTotals.netRevenue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Expense Summary */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-destructive" />
                  Expense Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell>Truck Payment</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.truckPayment)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Insurance</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.insurance)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Licensing & Permits</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.licensingPermits)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Cell Phone</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.cellPhone)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Fuel Cost</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.fuelCost)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Repairs & Maintenance</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.repairsParts + expenseTotals.maintenanceFund)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Savings & Retirement</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.savings + expenseTotals.retirement)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Other Operating</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseTotals.miscOperating)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-destructive/10">
                      <TableCell className="font-bold">Total Operating Expenses</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{formatCurrency(expenseTotals.operatingTotal)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Net Profit Card */}
          <Card className="card-elevated mt-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Net Profit/Loss</h3>
                  <p className="text-muted-foreground">Net Revenue minus Operating Expenses</p>
                </div>
                <div className={`text-4xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(netProfit)}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">Revenue per Mile</p>
                  <p className="text-lg font-medium">
                    {revenueTotals.actualMiles > 0 ? formatCurrency(revenueTotals.netRevenue / revenueTotals.actualMiles) : '$0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Miles</p>
                  <p className="text-lg font-medium">{revenueTotals.actualMiles.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Load Revenue</p>
                  <p className="text-lg font-medium">
                    {revenueTotals.loadCount > 0 ? formatCurrency(revenueTotals.netRevenue / revenueTotals.loadCount) : '$0.00'}
                  </p>
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
            <CardHeader>
              <CardTitle>Operating Expenses</CardTitle>
              <CardDescription>
                Track expenses per load or add fixed monthly expenses
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredExpenses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <PiggyBank className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No expense records for this period</p>
                  <p className="text-sm mt-2">Expenses can be added to individual loads for detailed P&L tracking</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Load ID</TableHead>
                      <TableHead className="text-right">Fuel</TableHead>
                      <TableHead className="text-right">Truck Pmt</TableHead>
                      <TableHead className="text-right">Insurance</TableHead>
                      <TableHead className="text-right">Licensing</TableHead>
                      <TableHead className="text-right">Cell</TableHead>
                      <TableHead className="text-right">Maint Fund</TableHead>
                      <TableHead className="text-right">Savings</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((exp: any) => {
                      const load = loads.find((l: any) => l.id === exp.load_id);
                      return (
                        <TableRow key={exp.id}>
                          <TableCell className="font-mono">{load?.landstar_load_id || '-'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(exp.fuel_cost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(exp.truck_payment)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(exp.insurance)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(exp.licensing_permits)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(exp.cell_phone)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(exp.maintenance_fund)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(exp.savings)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(exp.operating_total)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
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
                    <Button onClick={handleSaveSettings} className="gradient-gold text-primary-foreground">Save Settings</Button>
                    <Button variant="outline" onClick={() => setEditingSettings(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Gross %</p>
                      <p className="text-2xl font-bold">{getSetting('gross_percentage', '100')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Truck %</p>
                      <p className="text-2xl font-bold">{getSetting('truck_percentage', '65')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Trailer %</p>
                      <p className="text-2xl font-bold">{getSetting('trailer_percentage', '7')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Power Only %</p>
                      <p className="text-2xl font-bold">{getSetting('power_only_percentage', '5')}%</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Advance %</p>
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
    </DashboardLayout>
  );
}
