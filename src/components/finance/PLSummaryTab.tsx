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

  const now = new Date();
  const stamp = now.toLocaleTimeString('en-US', { hour12: false });
  const tfLabel = timeframe === 'week' ? '7-DAY' : timeframe === 'month' ? '30-DAY' : '90-DAY';

  return (
    <>
      {/* ============ BLOOMBERG-STYLE P&L COMMAND CENTER ============ */}
      <div className="mb-6 rounded-sm border border-[#1E2530] bg-[#0A0E14] text-zinc-100 overflow-hidden">
        {/* Ticker strip */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1E2530] bg-[#11151C]">
          <span className="font-mono text-[10px] tracking-[0.22em] text-zinc-500">
            FLEET&nbsp;P&amp;L · LIVE · UPDATED&nbsp;{stamp}
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] text-zinc-500">
            WINDOW · {tfLabel}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* ---------- Triple KPI row ---------- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Card 1 — Gross Revenue (green rail) */}
            <div className="relative bg-[#11151C] border border-[#1E2530] rounded-sm p-5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-emerald-500">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Fleet Gross Revenue
                </p>
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="font-mono text-4xl tabular-nums text-zinc-50">
                {formatCurrency(grossRevenue)}
              </p>
              <p className="font-mono text-[11px] text-zinc-500 mt-2 tracking-wider">
                {revenueTotals.loadCount} LOADS · {revenueTotals.bookedMiles.toLocaleString()} MI
              </p>
            </div>

            {/* Card 2 — Dispatched Expenses (plain) */}
            <div className="bg-[#11151C] border border-[#1E2530] rounded-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Total Dispatched Expenses
                </p>
                <TrendingDown className="h-4 w-4 text-rose-500" />
              </div>
              <p className="font-mono text-4xl tabular-nums text-zinc-200">
                {formatCurrency(combinedCosts)}
              </p>
              <p className="font-mono text-[11px] text-zinc-500 mt-2 tracking-wider">
                PAYROLL · COMMISSIONS · OPEX
              </p>
            </div>

            {/* Card 3 — Net Operating Margin (highlight) */}
            <div
              className={`relative bg-gradient-to-br from-[#11151C] to-[#1E2530] border border-[#1E2530] rounded-sm p-5 ring-1 ${
                noi >= 0 ? 'ring-emerald-500/40' : 'ring-rose-500/40'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  Net Operating Margin
                </p>
                <PiggyBank
                  className={`h-4 w-4 ${noi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                />
              </div>
              <p
                className={`font-mono text-5xl tabular-nums tracking-tight ${
                  noi >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatCurrency(noi)}
              </p>
              <p className="font-mono text-[11px] mt-2 tracking-wider">
                <span className="text-zinc-500">MARGIN&nbsp;</span>
                <span className={noi >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {noiMargin.toFixed(2)}%
                </span>
              </p>
            </div>
          </div>

          {/* ---------- CPM Ratios Tape ---------- */}
          <div className="bg-[#11151C] border border-[#1E2530] rounded-sm">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1E2530]">
              <div className="flex items-center gap-2">
                <Gauge className="h-3.5 w-3.5 text-amber-500" />
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  Operational Ratios · Per Mile
                </h3>
              </div>
              <ToggleGroup
                type="single"
                value={timeframe}
                onValueChange={(v) => v && setTimeframe(v as Timeframe)}
                className="bg-[#0A0E14] border border-[#1E2530] rounded-sm p-0.5"
              >
                {(['week', 'month', 'quarter'] as Timeframe[]).map((t) => (
                  <ToggleGroupItem
                    key={t}
                    value={t}
                    className="font-mono text-[10px] uppercase tracking-wider px-3 py-1 h-auto border-0 text-zinc-500 data-[state=on]:bg-[#1E2530] data-[state=on]:text-emerald-400"
                  >
                    {t}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1E2530]">
              <RatioCell
                code="RPM"
                label="Rev / Mile"
                value={trendLoading ? '—' : perMile(selected.revenue, selected.miles)}
                tone="up"
                sub={`${abbrevCurrency(selected.revenue)} over ${selected.miles.toLocaleString()} mi`}
              />
              <RatioCell
                code="EPM"
                label="Exp / Mile"
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
          </div>

          {/* ---------- 12-Week Trend Band ---------- */}
          <div className="bg-[#11151C] border border-[#1E2530] rounded-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  Trend · Gross vs Overhead · 12-Week Rolling
                </h3>
              </div>
              <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 bg-emerald-500" /> Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 bg-rose-500" /> Overhead
                </span>
              </div>
            </div>
            {trendLoading || !trend ? (
              <Skeleton className="h-[320px] w-full bg-[#1E2530]" />
            ) : trend.weekly.length === 0 ? (
              <div className="h-[320px] w-full flex items-center justify-center font-mono text-xs tracking-[0.3em] text-zinc-600">
                NO DATA
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
                        <stop offset="0%" stopColor="#22C55E" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="plCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#EF4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1E2530" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#6B7280"
                      tick={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fill: '#6B7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#1E2530' }}
                    />
                    <YAxis
                      stroke="#6B7280"
                      tick={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fill: '#6B7280' }}
                      tickFormatter={abbrevCurrency}
                      tickLine={false}
                      axisLine={{ stroke: '#1E2530' }}
                      width={56}
                    />
                    <Tooltip
                      formatter={(v: any) => formatCurrency(Number(v))}
                      contentStyle={{
                        background: '#0A0E14',
                        border: '1px solid #1E2530',
                        borderRadius: 2,
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 11,
                        color: '#E5E7EB',
                      }}
                      labelStyle={{ color: '#E5E7EB', fontWeight: 600 }}
                      cursor={{ stroke: '#F59E0B', strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="costs"
                      name="Overhead"
                      stroke="#EF4444"
                      strokeWidth={1.5}
                      fill="url(#plCost)"
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#22C55E"
                      strokeWidth={1.5}
                      fill="url(#plRev)"
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Net"
                      stroke="#F59E0B"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
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
