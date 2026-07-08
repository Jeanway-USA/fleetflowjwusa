import { useState, useMemo } from 'react';
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { useOperationalCPM } from '@/hooks/useOperationalCPM';
import { usePLTrend, type PeriodRollup, type RunwayMetrics } from '@/hooks/usePLTrend';

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

  const tfLabel = timeframe === 'week' ? '7-day' : timeframe === 'month' ? '30-day' : '90-day';

  return (
    <>
      {/* ============ Fleet P&L Overview ============ */}
      <div className="mb-6 space-y-4">
        {/* ---------- Triple KPI row ---------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1 — Gross Revenue */}
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Fleet Gross Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-foreground tabular-nums">
                {formatCurrency(grossRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {revenueTotals.loadCount} loads · {revenueTotals.bookedMiles.toLocaleString()} mi
              </p>
            </CardContent>
          </Card>

          {/* Card 2 — Dispatched Expenses */}
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Dispatched Expenses
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-foreground tabular-nums">
                {formatCurrency(combinedCosts)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Payroll · Commissions · Opex
              </p>
            </CardContent>
          </Card>

          {/* Card 3 — Net Operating Margin */}
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Net Operating Margin
              </CardTitle>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-foreground tabular-nums">
                {formatCurrency(noi)}
              </p>
              <p className="text-xs mt-2 flex items-center gap-1">
                <span className="text-muted-foreground">Margin</span>
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    noi >= 0 ? 'text-green-600' : 'text-destructive'
                  }`}
                >
                  {noi >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {noiMargin.toFixed(2)}%
                </span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ---------- Fleet Runway (Cost Per Day + Break-Even Gauge) ---------- */}
        <FleetRunwaySection loading={trendLoading} runway={trend?.runway} />





        {/* ---------- Operational Ratios ---------- */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Operational Ratios · Per Mile
            </CardTitle>
            <Tabs
              value={timeframe}
              onValueChange={(v) => setTimeframe(v as Timeframe)}
            >
              <TabsList>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="quarter">Quarter</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <RatioCell
                code="RPM"
                label="Revenue / Mile"
                value={trendLoading ? '—' : perMile(selected.revenue, selected.miles)}
                tone="up"
                sub={`${abbrevCurrency(selected.revenue)} over ${selected.miles.toLocaleString()} mi`}
              />
              <RatioCell
                code="EPM"
                label="Expense / Mile"
                value={trendLoading ? '—' : perMile(selected.costs, selected.miles)}
                tone="down"
                sub={`${abbrevCurrency(selected.costs)} over ${selected.miles.toLocaleString()} mi`}
              />
              <RatioCell
                code="NPM"
                label="Net / Mile"
                value={trendLoading ? '—' : selected.miles > 0 ? formatCurrency(npmValue) : '—'}
                tone={npmValue >= 0 ? 'up' : 'down'}
                sub={`${abbrevCurrency(selected.revenue - selected.costs)} net · ${tfLabel}`}
              />
            </div>
          </CardContent>
        </Card>

        {/* ---------- 12-Week Trend ---------- */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Gross vs Overhead · 12-Week Rolling
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-primary" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-destructive" /> Overhead
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 bg-muted-foreground" /> Net
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {trendLoading || !trend ? (
              <Skeleton className="h-[320px] w-full" />
            ) : trend.weekly.length === 0 ? (
              <div className="h-[320px] w-full flex items-center justify-center text-sm text-muted-foreground">
                No data available
              </div>
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={trend.weekly}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="plRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="plCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={abbrevCurrency}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      width={56}
                    />
                    <Tooltip
                      formatter={(v: any) => formatCurrency(Number(v))}
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'hsl(var(--popover-foreground))',
                      }}
                      labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 600 }}
                      cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="costs"
                      name="Overhead"
                      stroke="hsl(var(--destructive))"
                      strokeWidth={1.5}
                      fill="url(#plCost)"
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.5}
                      fill="url(#plRev)"
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Net"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>



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

function RatioCell({
  code,
  label,
  value,
  sub,
  tone,
}: {
  code: string;
  label: string;
  value: string;
  sub: string;
  tone: 'up' | 'down';
}) {
  const toneClass = tone === 'up' ? 'text-green-600' : 'text-destructive';
  const ToneIcon = tone === 'up' ? TrendingUp : TrendingDown;
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${toneClass}`}>
          <ToneIcon className="h-3 w-3" />
          {code}
        </span>
      </div>
      <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
    </div>
  );
}


