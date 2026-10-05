import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';
import { calculateLoadPay } from '@/utils/payCalculations';
import { truckRevenueOf } from '@/lib/pl-metrics';
import { usePaySettings } from '@/hooks/usePaySettings';


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
  revenue: { label: 'Your revenue', color: 'hsl(var(--primary))' },
  trueNetIncome: { label: 'Left after load costs', color: 'hsl(var(--success))' },
  totalCosts: { label: 'Load costs', color: 'hsl(var(--destructive))' },
};

export function LoadProfitabilityTab({
  deliveredLoads,
  loadExpenses,
  drivers,
  expenses,
  isIndependent = false,
}: LoadProfitabilityTabProps) {
  const paySettings = usePaySettings();


  // Build load-linked expense lookup from the expenses table (consistent with P&L)
  // Non-P&L expense types to exclude (must match Finance.tsx logic)
  const nonPLTypes = ['Advance', 'Cash Advance', 'Card Load', 'Direct Deposit', 'Reimbursement', 'Fuel Discount'];

  const loadExpenseMap = useMemo(() => {
    const map = new Map<string, { fuel: number; tolls: number; other: number; total: number }>();
    expenses.forEach((exp: any) => {
      if (!exp.load_id) return;
      // Exclude non-P&L items and credits (negative amounts)
      if (nonPLTypes.includes(exp.expense_type) || (exp.amount || 0) < 0) return;
      const existing = map.get(exp.load_id) || { fuel: 0, tolls: 0, other: 0, total: 0 };
      const amount = exp.amount || 0;
      const type = exp.expense_type;
      if (type === 'Fuel' || type === 'DEF') {
        existing.fuel += amount;
      } else if (type === 'Tolls') {
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
      // What the truck earns on the load. Gross is what the customer is billed; Landstar keeps its share.
      const gross = truckRevenueOf(load);
      const miles = load.actual_miles || load.booked_miles || 0;
      const linkedExpenses = loadExpenseMap.get(load.id) || { fuel: 0, tolls: 0, other: 0, total: 0 };

      // Driver pay via single source of truth (skip for independent — owner IS the driver)
      let driverPay = 0;
      if (!isIndependent && load.driver_id) {
        const driver = driverMap.get(load.driver_id);
        if (driver) {
          driverPay = calculateLoadPay(load, { pay_type: driver.pay_type, pay_rate: driver.pay_rate }, paySettings).total;
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
        revenue: gross,
        driverPay,
        fuelCost: linkedExpenses.fuel,
        tolls: linkedExpenses.tolls,
        otherExpenses: linkedExpenses.other,
        directCosts,
        totalCost,
        trueNetIncome: trueNet,
        rpm: miles > 0 ? gross / miles : 0,
      };
    }).sort((a, b) => (b.pickupDate || '').localeCompare(a.pickupDate || ''));
  }, [deliveredLoads, loadExpenseMap, driverMap, isIndependent, paySettings]);

  // Monthly trends
  const trendData = useMemo(() => {
    const monthMap = new Map<string, { gross: number; trueNet: number; costs: number }>();

    loadProfitability.forEach((lp) => {
      if (!lp.pickupDate) return;
      const monthKey = format(parseISO(lp.pickupDate), 'MMM yyyy');
      const existing = monthMap.get(monthKey) || { gross: 0, trueNet: 0, costs: 0 };
      existing.gross += lp.revenue;
      existing.trueNet += lp.trueNetIncome;
      existing.costs += lp.totalCost;
      monthMap.set(monthKey, existing);
    });

    return Array.from(monthMap.entries())
      .map(([period, data]) => ({
        period,
        revenue: Math.round(data.gross),
        trueNetIncome: Math.round(data.trueNet),
        totalCosts: Math.round(data.costs),
      }));
  }, [loadProfitability]);

  return (
    <div className="space-y-6">
      {/* Revenue Trends Chart */}
      {trendData.length > 1 && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Revenue and load costs by month
            </CardTitle>
            <CardDescription>Your revenue against costs tied to loads, for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="period" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area type="monotone" dataKey="revenue" stackId="" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.15} />
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
            Left after load costs = Your revenue − ({!isIndependent ? 'Driver Pay + ' : ''}expenses tied to the load)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>{isIndependent ? 'Load ID' : 'Landstar Load ID'}</TableHead>
                   <TableHead>Date</TableHead>
                   <TableHead className="text-right">Miles</TableHead>
                  <TableHead className="text-right">Your revenue</TableHead>
                  {!isIndependent && <TableHead className="text-right">Driver Pay</TableHead>}
                  <TableHead className="text-right">Fuel</TableHead>
                  <TableHead className="text-right">Tolls</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">Left after costs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadProfitability.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isIndependent ? 8 : 9} className="text-center py-8 text-muted-foreground">
                      No delivered loads in this period
                    </TableCell>
                  </TableRow>
                ) : (
                  loadProfitability.map((lp) => (
                    <TableRow key={lp.id}>
                      <TableCell>
                         <div className="font-medium text-sm">{lp.loadId}</div>
                       </TableCell>
                       <TableCell className="text-sm text-muted-foreground">
                         {lp.pickupDate ? format(parseISO(lp.pickupDate), 'MMM d, yyyy') : '—'}
                       </TableCell>
                       <TableCell className="text-right font-mono text-sm">{lp.miles.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(lp.revenue)}</TableCell>
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
