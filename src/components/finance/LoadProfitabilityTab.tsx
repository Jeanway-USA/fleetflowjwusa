import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Target, BarChart3, Calculator } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';

interface LoadProfitabilityTabProps {
  deliveredLoads: any[];
  loadExpenses: any[];
  drivers: any[];
  expenses: any[];
  totalExpenses: number;
  totalPayroll: number;
  revenueTotals: any;
  allLoads: any[];
  isIndependent?: boolean;
}

const chartConfig = {
  grossRevenue: { label: 'Gross Revenue', color: 'hsl(45 80% 50%)' },
  trueNetIncome: { label: 'True Net Income', color: 'hsl(142 70% 45%)' },
  totalCosts: { label: 'Total Costs', color: 'hsl(0 70% 50%)' },
};

export function LoadProfitabilityTab({
  deliveredLoads,
  loadExpenses,
  drivers,
  expenses,
  totalExpenses,
  totalPayroll,
  revenueTotals,
  allLoads,
  isIndependent = false,
}: LoadProfitabilityTabProps) {

  // Build load-linked expense lookup from the expenses table (consistent with P&L)
  const loadExpenseMap = useMemo(() => {
    const map = new Map<string, { fuel: number; tolls: number; other: number; total: number }>();
    expenses.forEach((exp: any) => {
      if (!exp.load_id) return;
      const existing = map.get(exp.load_id) || { fuel: 0, tolls: 0, other: 0, total: 0 };
      const amount = exp.amount || 0;
      if (exp.expense_type === 'fuel') {
        existing.fuel += amount;
      } else if (exp.expense_type === 'tolls') {
        existing.tolls += amount;
      } else {
        existing.other += amount;
      }
      existing.total += amount;
      map.set(exp.load_id, existing);
    });
    return map;
  }, [expenses]);

  // Driver lookup (only needed for Landstar mode)
  const driverMap = useMemo(() => {
    const map = new Map<string, any>();
    drivers.forEach((d: any) => map.set(d.id, d));
    return map;
  }, [drivers]);

  // Per-load profitability
  const loadProfitability = useMemo(() => {
    return deliveredLoads.map((load: any) => {
      const gross = load.gross_revenue || 0;
      const miles = load.actual_miles || load.booked_miles || 0;
      const linkedExpenses = loadExpenseMap.get(load.id) || { fuel: 0, tolls: 0, other: 0, total: 0 };

      // Driver pay: skip for independent (owner IS the driver)
      let driverPay = 0;
      if (!isIndependent && load.driver_id) {
        const driver = driverMap.get(load.driver_id);
        if (driver) {
          if (driver.pay_type === 'percentage') {
            driverPay = gross * ((driver.pay_rate || 0) / 100);
          } else {
            driverPay = (driver.pay_rate || 0) * miles;
          }
        }
      }

      const directCosts = linkedExpenses.total;
      const totalCost = driverPay + directCosts;
      const trueNet = gross - totalCost;

      return {
        id: load.id,
        loadId: load.landstar_load_id || `${load.origin?.split(',')[0]} → ${load.destination?.split(',')[0]}`,
        origin: load.origin,
        destination: load.destination,
        pickupDate: load.pickup_date,
        miles,
        grossRevenue: gross,
        driverPay,
        fuelCost: linkedExpenses.fuel,
        tolls: linkedExpenses.tolls,
        otherExpenses: linkedExpenses.other,
        directCosts,
        totalCost,
        trueNetIncome: trueNet,
        rpm: miles > 0 ? gross / miles : 0,
      };
    }).sort((a, b) => a.trueNetIncome - b.trueNetIncome);
  }, [deliveredLoads, loadExpenseMap, driverMap, isIndependent]);

  // Aggregates
  const totalTrueNet = loadProfitability.reduce((s, l) => s + l.trueNetIncome, 0);
  const totalGross = loadProfitability.reduce((s, l) => s + l.grossRevenue, 0);
  const totalMiles = revenueTotals.actualMiles || loadProfitability.reduce((s, l) => s + l.miles, 0);

  // Break-even RPM — consistent with P&L: (total expenses + payroll) / total miles
  const breakEvenRPM = totalMiles > 0 ? (totalExpenses + totalPayroll) / totalMiles : 0;
  const actualRPM = totalMiles > 0 ? revenueTotals.netRevenue / totalMiles : 0;

  // Actual CPM — consistent with P&L
  const actualCPM = totalMiles > 0 ? (totalExpenses + totalPayroll) / totalMiles : 0;

  // Monthly trends
  const trendData = useMemo(() => {
    const monthMap = new Map<string, { gross: number; trueNet: number; costs: number }>();

    loadProfitability.forEach((lp) => {
      if (!lp.pickupDate) return;
      const monthKey = format(parseISO(lp.pickupDate), 'MMM yyyy');
      const existing = monthMap.get(monthKey) || { gross: 0, trueNet: 0, costs: 0 };
      existing.gross += lp.grossRevenue;
      existing.trueNet += lp.trueNetIncome;
      existing.costs += lp.totalCost;
      monthMap.set(monthKey, existing);
    });

    return Array.from(monthMap.entries())
      .map(([period, data]) => ({
        period,
        grossRevenue: Math.round(data.gross),
        trueNetIncome: Math.round(data.trueNet),
        totalCosts: Math.round(data.costs),
      }));
  }, [loadProfitability]);

  const profitableLoads = loadProfitability.filter(l => l.trueNetIncome >= 0).length;
  const unprofitableLoads = loadProfitability.length - profitableLoads;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">True Net Income</CardTitle>
            {totalTrueNet >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalTrueNet >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(totalTrueNet)}
            </div>
            <p className="text-xs text-muted-foreground">
              {profitableLoads} profitable · {unprofitableLoads} unprofitable
            </p>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Break-Even RPM</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(breakEvenRPM)}</div>
            <p className="text-xs text-muted-foreground">
              Current avg: {formatCurrency(actualRPM)}/mi
              {actualRPM > breakEvenRPM
                ? <span className="text-success ml-1">▲ Above</span>
                : <span className="text-destructive ml-1">▼ Below</span>}
            </p>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actual CPM</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(actualCPM)}</div>
            <p className="text-xs text-muted-foreground">
              All costs / total miles
            </p>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">True Margin</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalGross > 0 && (totalTrueNet / totalGross) * 100 >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalGross > 0 ? ((totalTrueNet / totalGross) * 100).toFixed(1) : '0.0'}%
            </div>
            <p className="text-xs text-muted-foreground">After all tracked costs</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trends Chart */}
      {trendData.length > 1 && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Gross vs True Net Income Trends
            </CardTitle>
            <CardDescription>Monthly breakdown for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="period" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area type="monotone" dataKey="grossRevenue" stackId="" stroke="var(--color-grossRevenue)" fill="var(--color-grossRevenue)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="trueNetIncome" stackId="" stroke="var(--color-trueNetIncome)" fill="var(--color-trueNetIncome)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="totalCosts" stackId="" stroke="var(--color-totalCosts)" fill="var(--color-totalCosts)" fillOpacity={0.1} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-Load Profitability Table */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Per-Load Profitability</CardTitle>
          <CardDescription>
            True net = Gross Revenue − ({!isIndependent ? 'Driver Pay + ' : ''}Load-linked expenses)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Load</TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead className="text-right">Gross Rev</TableHead>
                  {!isIndependent && <TableHead className="text-right">Driver Pay</TableHead>}
                  <TableHead className="text-right">Fuel</TableHead>
                  <TableHead className="text-right">Tolls</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">True Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadProfitability.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isIndependent ? 7 : 8} className="text-center py-8 text-muted-foreground">
                      No delivered loads in this period
                    </TableCell>
                  </TableRow>
                ) : (
                  loadProfitability.map((lp) => (
                    <TableRow key={lp.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{lp.loadId}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{lp.miles.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(lp.grossRevenue)}</TableCell>
                      {!isIndependent && (
                        <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(lp.driverPay)}</TableCell>
                      )}
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(lp.fuelCost)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(lp.tolls)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(lp.otherExpenses)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={lp.trueNetIncome >= 0 ? 'default' : 'destructive'} className={lp.trueNetIncome >= 0 ? 'bg-success text-success-foreground' : ''}>
                          {formatCurrency(lp.trueNetIncome)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
