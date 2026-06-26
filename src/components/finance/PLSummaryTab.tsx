import { useState, useMemo } from 'react';
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Route,
  Target,
  Gauge,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { useOperationalCPM } from '@/hooks/useOperationalCPM';
import { usePLTrend, type PeriodRollup } from '@/hooks/usePLTrend';

interface PLSummaryTabProps {
  revenueTotals: any;
  loadExpenseTotals: any;
  standaloneExpenseTotals: any;
  loadLinkedExpenseTotals: any;
  payrollTotals: any;
  commissionTotals: any;
  deadheadMiles: number;
  totalEmptyMiles: number;
  totalActualMilesWithDeadhead: number;
  netProfit: number;
  profitMargin: number;
  totalExpenses: number;
  totalRevenueWithCommissions: number;
  getSetting: (key: string, defaultValue?: string) => string;
}

type Timeframe = 'week' | 'month' | 'quarter';

const abbrevCurrency = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const perMile = (numerator: number, miles: number) =>
  miles > 0 ? formatCurrency(numerator / miles) : '—';

export function PLSummaryTab({
  revenueTotals,
  loadExpenseTotals,
  standaloneExpenseTotals,
  loadLinkedExpenseTotals,
  payrollTotals,
  commissionTotals,
  deadheadMiles,
  totalEmptyMiles,
  totalActualMilesWithDeadhead,
  netProfit,
  profitMargin,
  totalExpenses,
  totalRevenueWithCommissions,
  getSetting,
}: PLSummaryTabProps) {
  const { costPerMile } = useOperationalCPM();
  const overheadCost = costPerMile * totalActualMilesWithDeadhead;
  const trueNetIncome = netProfit - overheadCost;
  const breakEvenRPM = totalActualMilesWithDeadhead > 0 ? (totalExpenses + payrollTotals.netPay + overheadCost) / totalActualMilesWithDeadhead : 0;

  // === Executive P&L ===
  const grossRevenue = Number(revenueTotals.grossRevenue) || 0;
  const combinedCosts =
    (Number(totalExpenses) || 0) +
    (Number(payrollTotals.netPay) || 0) +
    (Number(commissionTotals.amount) || 0);
  const noi = grossRevenue - combinedCosts;
  const noiMargin = grossRevenue > 0 ? (noi / grossRevenue) * 100 : 0;

  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const { data: trend, isLoading: trendLoading } = usePLTrend();

  const selected: PeriodRollup = useMemo(() => {
    if (!trend) return { revenue: 0, costs: 0, miles: 0 };
    return trend[timeframe];
  }, [trend, timeframe]);

  const npmValue = selected.miles > 0 ? (selected.revenue - selected.costs) / selected.miles : 0;

  return (
    <>
      {/* ============ EXECUTIVE P&L HEADER ============ */}
      <Card className="card-elevated mb-6 border-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Executive P&amp;L
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Triple KPI blocks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={<DollarSign className="h-5 w-5 text-success" />}
              label="Fleet Top-Line Gross Revenue"
              value={formatCurrency(grossRevenue)}
              sub="Sum of all completed load earnings"
              valueClass="text-success"
            />
            <KpiCard
              icon={<TrendingDown className="h-5 w-5 text-destructive" />}
              label="Combined Fleet Overhead Costs"
              value={formatCurrency(combinedCosts)}
              sub="Driver pay + reimbursements + asset upkeep + commissions"
              valueClass="text-destructive"
            />
            <KpiCard
              icon={<PiggyBank className={`h-5 w-5 ${noi >= 0 ? 'text-success' : 'text-destructive'}`} />}
              label="Net Operating Income"
              value={formatCurrency(noi)}
              sub={`Margin ${noiMargin.toFixed(1)}%`}
              valueClass={noi >= 0 ? 'text-success' : 'text-destructive'}
            />
          </div>

          {/* CPM Calculator */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider">
                  Live Cost-Per-Mile Calculator
                </h3>
              </div>
              <ToggleGroup
                type="single"
                value={timeframe}
                onValueChange={(v) => v && setTimeframe(v as Timeframe)}
                size="sm"
              >
                <ToggleGroupItem value="week">Week</ToggleGroupItem>
                <ToggleGroupItem value="month">Month</ToggleGroupItem>
                <ToggleGroupItem value="quarter">Quarter</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CpmStat
                label="Revenue / Mile"
                hint="RPM"
                value={trendLoading ? '—' : perMile(selected.revenue, selected.miles)}
                valueClass="text-success"
              />
              <CpmStat
                label="Expense / Mile"
                hint="EPM"
                value={trendLoading ? '—' : perMile(selected.costs, selected.miles)}
                valueClass="text-destructive"
              />
              <CpmStat
                label="Net Profit / Mile"
                hint="NPM"
                value={trendLoading ? '—' : (selected.miles > 0 ? formatCurrency(npmValue) : '—')}
                valueClass={npmValue >= 0 ? 'text-success' : 'text-destructive'}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Totals across {selected.miles.toLocaleString()} miles in the trailing {timeframe === 'week' ? '7 days' : timeframe === 'month' ? '30 days' : '90 days'}.
            </p>
          </div>

          {/* 12-week trend chart */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Revenue vs Expenses · 12-Week Trend
              </h3>
            </div>
            {trendLoading || !trend ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend.weekly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="plRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="plCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={abbrevCurrency} width={56} />
                    <Tooltip
                      formatter={(v: any) => formatCurrency(Number(v))}
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Gross Revenue"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      fill="url(#plRev)"
                    />
                    <Area
                      type="monotone"
                      dataKey="costs"
                      name="Combined Costs"
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2}
                      fill="url(#plCost)"
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Net"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Flow */}
      <Card className="card-elevated mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
            <div className="p-4 bg-muted rounded-lg overflow-hidden">
              <p className="text-sm text-muted-foreground mb-1">100% GROSS</p>
              <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(revenueTotals.grossRevenue)}</p>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg overflow-hidden">
              <p className="text-sm text-muted-foreground mb-1 truncate">TRUCK REVENUE ({getSetting('truck_percentage', '65')}%)</p>
              <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(revenueTotals.truckRevenue)}</p>
            </div>
            <div className="p-4 bg-success/10 rounded-lg overflow-hidden">
              <p className="text-sm text-muted-foreground mb-1">NET PROFIT</p>
              <p className="text-xl sm:text-2xl font-bold text-success truncate">{formatCurrency(netProfit)}</p>
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
                  <TableCell className="text-right font-mono">{totalEmptyMiles.toLocaleString()}</TableCell>
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
                <span>Agency Commissions (Revenue)</span>
                <span className="font-mono text-success">+{formatCurrency(commissionTotals.amount)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                <span>Total Revenue</span>
                <span className="font-mono">{formatCurrency(totalRevenueWithCommissions)}</span>
              </div>
              <div className="flex justify-between mt-4">
                <span>Operating Expenses</span>
                <span className="font-mono text-destructive">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between">
                <span>Driver Payroll</span>
                <span className="font-mono text-destructive">-{formatCurrency(payrollTotals.netPay)}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-lg">{netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}</span>
                  <span className={`font-bold text-xl sm:text-2xl truncate ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netProfit)}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center overflow-hidden">
                <p className="text-sm text-muted-foreground">Loads</p>
                <p className="text-xl sm:text-2xl font-bold truncate">{revenueTotals.loadCount}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center overflow-hidden">
                <p className="text-sm text-muted-foreground">Profit Margin</p>
                <p className={`text-xl sm:text-2xl font-bold truncate ${profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {profitMargin.toFixed(1)}%
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center overflow-hidden">
                <p className="text-sm text-muted-foreground">Avg Per Load</p>
                <p className="text-lg sm:text-xl font-bold truncate">
                  {revenueTotals.loadCount > 0 ? formatCurrency(netProfit / revenueTotals.loadCount) : '$0.00'}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center overflow-hidden">
                <p className="text-sm text-muted-foreground">Profit Per Mile</p>
                <p className="text-lg sm:text-xl font-bold truncate">
                  {revenueTotals.actualMiles > 0 ? formatCurrency(netProfit / revenueTotals.actualMiles) : '$0.00'}
                </p>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg text-center overflow-hidden">
                <p className="text-sm text-muted-foreground">True Net Income</p>
                <p className={`text-lg sm:text-xl font-bold truncate ${trueNetIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(trueNetIncome)}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center overflow-hidden">
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1"><Target className="h-3 w-3 flex-shrink-0" /> Break-Even RPM</p>
                <p className="text-lg sm:text-xl font-bold truncate">
                  {formatCurrency(breakEvenRPM)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl sm:text-3xl font-bold tabular-nums truncate ${valueClass ?? ''}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
    </div>
  );
}

function CpmStat({
  label,
  hint,
  value,
  valueClass,
}: {
  label: string;
  hint: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md bg-background border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-[10px] font-mono text-muted-foreground/70">{hint}</span>
      </div>
      <p className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${valueClass ?? ''}`}>
        {value}
      </p>
    </div>
  );
}
