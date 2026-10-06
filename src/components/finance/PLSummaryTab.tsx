import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { useOperationalCPM } from '@/hooks/useOperationalCPM';
import { usePLTrend, type PeriodRollup, type RunwayMetrics } from '@/hooks/usePLTrend';
import { workbookMetrics, type DriverPayTotals, type FuelStats } from '@/lib/pl-metrics';

interface PLSummaryTabProps {
  revenueTotals: any;
  loadExpenseTotals: any;
  standaloneExpenseTotals: any;
  loadLinkedExpenseTotals: any;
  payrollTotals: any;
  driverPay: DriverPayTotals;
  commissionTotals: any;
  deadheadMiles: number;
  totalEmptyMiles: number;
  totalActualMilesWithDeadhead: number;
  netProfit: number;
  profitMargin: number;
  totalExpenses: number;
  totalRevenueWithCommissions: number;
  fuel: FuelStats;
  truckPaymentsTotal: number;
  advancesTotal: number;
  creditsTotal: number;
  getSetting: (key: string, defaultValue?: string) => string;
}

type Timeframe = 'week' | 'month' | 'quarter';

const abbrevCurrency = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));
const takeOff = (v: number) => (v > 0 ? `−${formatCurrency(v)}` : formatCurrency(0));
const perMile = (numerator: number, miles: number) => (miles > 0 ? formatCurrency(numerator / miles) : 'No miles yet');
const percent = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`;

function StatementLine({ label, note, value, strong, rule, muted, tone }: {
  label: React.ReactNode;
  note?: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  rule?: 'single' | 'double';
  muted?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-3 py-2.5',
        rule === 'single' && 'border-t',
        rule === 'double' && 'border-t-[3px] border-double border-foreground/70',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className={cn('text-[15px]', strong && 'font-semibold')}>{label}</div>
        {note && <div className="text-[13px] text-muted-foreground">{note}</div>}
      </div>
      <div
        className={cn(
          'figure shrink-0 text-right',
          strong ? 'text-2xl font-bold' : 'text-lg font-semibold',
          muted && 'text-muted-foreground',
          tone === 'good' && 'text-success',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Panel({ title, description, children, className, aside }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={cn('rounded-lg border bg-card px-4 pt-3 pb-2', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-condensed text-xl font-bold leading-tight">{title}</h3>
        {aside}
      </div>
      {description && <p className="pb-1 text-[13px] text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

export function PLSummaryTab({
  revenueTotals,
  driverPay,
  commissionTotals,
  deadheadMiles,
  totalEmptyMiles,
  totalActualMilesWithDeadhead,
  netProfit,
  profitMargin,
  totalExpenses,
  totalRevenueWithCommissions,
  fuel,
  truckPaymentsTotal,
  advancesTotal,
  creditsTotal,
  getSetting,
}: PLSummaryTabProps) {
  const { costPerMile } = useOperationalCPM();
  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const { data: trend, isLoading: trendLoading } = usePLTrend();

  const truckPct = getSetting('truck_percentage', '65');
  const trailerPct = getSetting('trailer_percentage', '7');

  // Revenue is what the truck earns. Gross is what the customer is billed; Landstar keeps the difference.
  const grossRevenue = Number(revenueTotals.grossRevenue) || 0;
  const yourRevenue = Number(revenueTotals.netRevenue) || 0;
  const landstarShare = Math.max(0, grossRevenue - yourRevenue);
  const payroll = driverPay.total;
  const commissions = Number(commissionTotals.amount) || 0;
  const hasLoads = revenueTotals.loadCount > 0;

  const overheadCost = costPerMile * totalActualMilesWithDeadhead;
  const trueNetIncome = netProfit - overheadCost;
  const recordedCosts = totalExpenses + payroll;
  const recordedCostPerMile = totalActualMilesWithDeadhead > 0 ? recordedCosts / totalActualMilesWithDeadhead : 0;
  const breakEvenRPM = totalActualMilesWithDeadhead > 0 ? (recordedCosts + overheadCost) / totalActualMilesWithDeadhead : 0;
  const revenuePerMile = totalActualMilesWithDeadhead > 0 ? yourRevenue / totalActualMilesWithDeadhead : 0;

  const metrics = workbookMetrics({
    loadCount: revenueTotals.loadCount,
    revenue: yourRevenue,
    fuelSurcharge: Number(revenueTotals.fuelSurcharge) || 0,
    actualMiles: revenueTotals.actualMiles,
    fuel,
  });

  const selected: PeriodRollup = useMemo(() => {
    if (!trend) return { revenue: 0, costs: 0, miles: 0 };
    return trend[timeframe];
  }, [trend, timeframe]);
  const npmValue = selected.miles > 0 ? (selected.revenue - selected.costs) / selected.miles : 0;
  const tfLabel = timeframe === 'week' ? '7-day' : timeframe === 'month' ? '30-day' : '90-day';

  return (
    <div className="space-y-6">
      {/* ============ The statement, and the numbers that explain it ============ */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Panel
          title="Profit and loss"
          description="Revenue is what your truck earns, the way Landstar's own workbook counts it."
          className="lg:col-span-3"
        >
          <StatementLine
            label="Billed to customers"
            note={`${revenueTotals.loadCount} load${revenueTotals.loadCount === 1 ? '' : 's'} delivered, gross`}
            value={money(grossRevenue)}
            muted
          />
          <StatementLine
            label="Landstar's share"
            note={`${100 - Number(truckPct)}% of linehaul. Fuel surcharge comes to you at 100%.`}
            value={takeOff(landstarShare)}
            muted
          />
          <StatementLine label="Your revenue" note={`Truck ${truckPct}%, fuel surcharge, accessorials`} value={money(yourRevenue)} strong rule="single" />
          {commissions > 0 && <StatementLine label="Agent commissions" value={`+${formatCurrency(commissions)}`} />}
          <StatementLine
            label="Operating expenses"
            note={
              totalExpenses > 0 ? (
                <>
                  {truckPaymentsTotal > 0 ? `Includes ${formatCurrency(truckPaymentsTotal)} in truck payments` : 'Recorded in this period'}
                  {creditsTotal > 0 && `, after ${formatCurrency(creditsTotal)} in credits`}
                </>
              ) : (
                'Nothing entered or imported for this period'
              )
            }
            value={totalExpenses > 0 ? takeOff(totalExpenses) : 'None yet'}
            muted
          />
          {payroll > 0 && (
            <StatementLine
              label="Driver pay"
              note={[driverPay.settlementCount > 0 ? `${driverPay.settlementCount} settlement${driverPay.settlementCount === 1 ? '' : 's'}, gross pay plus reimbursements` : '', driverPay.batchCount > 0 ? `${driverPay.batchCount} payroll batch${driverPay.batchCount === 1 ? '' : 'es'}` : ''].filter(Boolean).join(', ')}
              value={takeOff(payroll)}
              muted
            />
          )}
          <StatementLine
            label={netProfit >= 0 ? 'Net profit' : 'Net loss'}
            note={totalExpenses > 0 || payroll > 0 ? `${profitMargin.toFixed(1)}% of ${commissions > 0 ? 'revenue with commissions' : 'your revenue'}` : 'Will drop as expenses are recorded'}
            value={money(netProfit)}
            strong
            rule="double"
            tone={netProfit < 0 ? 'bad' : undefined}
          />
          {advancesTotal > 0 && (
            <p className="border-t pt-2 pb-1 text-[13px] text-muted-foreground tabular-nums">
              Card advances of {formatCurrency(advancesTotal)} are not counted as expenses.
            </p>
          )}
        </Panel>

        <Panel title="Per load and per mile" className="lg:col-span-2">
          <dl className="divide-y">
            <Ratio label="Revenue per load" note="With fuel surcharge" value={hasLoads ? formatCurrency(metrics.avgRevenuePerLoad) : 'None yet'} />
            <Ratio label="Revenue per load" note="Without fuel surcharge" value={hasLoads ? formatCurrency(metrics.avgRevenuePerLoadWithoutFsc) : 'None yet'} />
            <Ratio label="Profit per load" value={hasLoads ? money(netProfit / revenueTotals.loadCount) : 'None yet'} />
            <Ratio label="Revenue per mile" note="Your revenue over actual miles" value={perMile(yourRevenue, totalActualMilesWithDeadhead)} />
            <Ratio label="Profit per mile" value={revenueTotals.actualMiles > 0 ? money(netProfit / revenueTotals.actualMiles) : 'No miles yet'} />
            <Ratio label="Cost per mile" note="Recorded costs over actual miles" value={totalActualMilesWithDeadhead > 0 ? (recordedCosts > 0 ? formatCurrency(recordedCostPerMile) : 'None yet') : 'No miles yet'} />
            <Ratio
              label="Break-even revenue per mile"
              note={
                totalActualMilesWithDeadhead > 0
                  ? `Now ${formatCurrency(revenuePerMile)}, ${revenuePerMile >= breakEvenRPM ? 'above' : 'below'} break-even. Includes overhead estimated at ${formatCurrency(costPerMile)} a mile.`
                  : undefined
              }
              value={totalActualMilesWithDeadhead > 0 ? formatCurrency(breakEvenRPM) : 'No miles yet'}
            />
            <Ratio
              label="True net income"
              note={`Net profit less overhead estimated at ${formatCurrency(costPerMile)} a mile`}
              value={money(trueNetIncome)}
              tone={trueNetIncome < 0 ? 'bad' : undefined}
            />
          </dl>
        </Panel>
      </div>

      {/* ============ Revenue, and miles and fuel ============ */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Revenue">
          <StatementLine label="Linehaul" note="Booked, before the split" value={money(revenueTotals.bookedLinehaul)} />
          <StatementLine
            label="Fuel surcharge"
            note={`${grossRevenue > 0 ? ((revenueTotals.fuelSurcharge / grossRevenue) * 100).toFixed(1) : '0.0'}% of gross, ${percent(metrics.fscShareOfRevenue)} of your revenue`}
            value={money(revenueTotals.fuelSurcharge)}
          />
          <StatementLine label="Accessorials" value={money(revenueTotals.accessorials)} />
          <StatementLine label="Gross revenue (100%)" value={money(grossRevenue)} strong rule="single" />
          <StatementLine label={`Truck revenue (${truckPct}%)`} value={money(revenueTotals.truckRevenue)} muted />
          <StatementLine label={`Trailer revenue (${trailerPct}%)`} value={money(revenueTotals.trailerRevenue)} muted />
          <StatementLine label="Your revenue" note="Truck plus trailer" value={money(yourRevenue)} strong rule="double" />
        </Panel>

        <Panel title="Miles and fuel">
          <StatementLine label="Paid miles" note="Booked" value={revenueTotals.bookedMiles.toLocaleString()} />
          <StatementLine label="Actual miles" value={revenueTotals.actualMiles.toLocaleString()} />
          <StatementLine label="Deadhead miles" note="Between loads" value={deadheadMiles.toLocaleString()} />
          <StatementLine label="Empty miles" value={totalEmptyMiles.toLocaleString()} />
          <StatementLine
            label="Empty miles share"
            value={totalActualMilesWithDeadhead > 0 ? percent(totalEmptyMiles / totalActualMilesWithDeadhead, 2) : 'No miles yet'}
            strong
            rule="single"
          />
          <StatementLine label="Average miles per load" value={hasLoads ? Math.round(metrics.avgMilesPerLoad).toLocaleString() : 'None yet'} />
          <StatementLine
            label="Fuel"
            note={fuel.gallons > 0 ? `${fuel.gallons.toLocaleString('en-US', { maximumFractionDigits: 1 })} gallons, ${formatCurrency(fuel.discounts)} in discounts` : 'No fuel gallons recorded for this period'}
            value={fuel.gallons > 0 ? money(fuel.netCost) : 'None yet'}
            rule="single"
          />
          <StatementLine label="Cost per gallon" note="After discounts" value={fuel.gallons > 0 ? formatCurrency(fuel.costPerGallon) : 'None yet'} />
          <StatementLine label="Miles per gallon" value={metrics.milesPerGallon > 0 ? metrics.milesPerGallon.toFixed(2) : 'None yet'} />
          <StatementLine
            label="Cost per gallon after fuel surcharge"
            note="What a gallon costs once the surcharge you collect is counted"
            value={metrics.costPerGallonAfterFsc !== 0 ? formatCurrency(metrics.costPerGallonAfterFsc) : 'None yet'}
          />
        </Panel>
      </div>

      {/* ============ Per-mile ratios by timeframe ============ */}
      <Panel
        title="Per mile"
        description="Your revenue and recorded costs over actual miles."
        aside={
          <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
            <TabsList className="h-11">
              <TabsTrigger value="week" className="h-9 px-4">Week</TabsTrigger>
              <TabsTrigger value="month" className="h-9 px-4">Month</TabsTrigger>
              <TabsTrigger value="quarter" className="h-9 px-4">Quarter</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <dl className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <RatioCell
            label="Revenue per mile"
            value={trendLoading ? 'Loading' : perMile(selected.revenue, selected.miles)}
            sub={`${abbrevCurrency(selected.revenue)} over ${selected.miles.toLocaleString()} mi`}
          />
          <RatioCell
            label="Expense per mile"
            value={trendLoading ? 'Loading' : perMile(selected.costs, selected.miles)}
            sub={`${abbrevCurrency(selected.costs)} over ${selected.miles.toLocaleString()} mi`}
          />
          <RatioCell
            label="Net per mile"
            value={trendLoading ? 'Loading' : selected.miles > 0 ? money(npmValue) : 'No miles yet'}
            sub={`${abbrevCurrency(selected.revenue - selected.costs)} net, ${tfLabel}`}
          />
        </dl>
      </Panel>

      {/* ============ 12-week trend ============ */}
      <Panel
        title="Revenue and costs by settlement week"
        description="Twelve weeks, each ending on a Wednesday. Revenue is yours, not gross."
        aside={
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-primary" /> Revenue</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-destructive" /> Costs</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 bg-muted-foreground" /> Net</span>
          </div>
        }
      >
        <div className="pb-2 pt-2">
          {trendLoading || !trend ? (
            <Skeleton className="h-[300px] w-full" />
          ) : trend.weekly.length === 0 ? (
            <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">No data available</div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend.weekly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={abbrevCurrency}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    width={56}
                  />
                  <Tooltip
                    formatter={(v: any) => formatCurrency(Number(v))}
                    labelFormatter={(l) => `Week ending ${l}`}
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 6,
                      fontSize: 13,
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 600 }}
                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="costs" name="Costs" stroke="hsl(var(--destructive))" strokeWidth={1.5} fill="hsl(var(--destructive))" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="hsl(var(--primary))" fillOpacity={0.12} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Panel>

      {/* ============ Runway ============ */}
      <FleetRunwaySection loading={trendLoading} runway={trend?.runway} />
    </div>
  );
}

function Ratio({ label, note, value, tone }: { label: string; note?: React.ReactNode; value: string; tone?: 'bad' }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <dt className="text-[15px]">{label}</dt>
        {note && <dd className="text-[13px] text-muted-foreground">{note}</dd>}
      </div>
      <dd className={cn('figure shrink-0 text-right text-lg font-semibold', tone === 'bad' && 'text-destructive')}>{value}</dd>
    </div>
  );
}

function RatioCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-1 py-3 sm:px-5 sm:first:pl-1">
      <dt className="text-[15px] text-muted-foreground">{label}</dt>
      <dd className="figure mt-0.5 text-2xl font-bold">{value}</dd>
      <dd className="mt-0.5 truncate text-[13px] text-muted-foreground">{sub}</dd>
    </div>
  );
}

function FleetRunwaySection({ loading, runway }: { loading: boolean; runway?: RunwayMetrics }) {
  if (loading || !runway) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <Skeleton className="h-[220px] w-full" />
      </section>
    );
  }

  const hasExpenses = runway.trailing30Expenses !== 0 || runway.monthToDateExpenses !== 0;
  // The month is only judged once it has costs; a month with none yet (the loan payment may not have posted) is not a loss.
  const hasMonthCosts = runway.monthToDateExpenses > 0;
  const hasDispatch = runway.plannedDispatchDays > 0;
  const hasCostPerDay = runway.costPerDay > 0;

  const coverageRatio = hasMonthCosts ? runway.monthToDateRevenue / runway.monthToDateExpenses : 0;
  const delta = runway.monthToDateNet;

  const gaugeColor =
    coverageRatio >= 1 ? 'hsl(var(--success))' : coverageRatio >= 0.9 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  const statusLabel =
    !hasMonthCosts ? 'No costs this month yet'
      : coverageRatio >= 1 ? 'Net profit this month'
      : coverageRatio >= 0.9 ? 'Approaching break-even'
      : 'Below break-even';
  const statusClass = !hasMonthCosts
    ? 'text-muted-foreground'
    : coverageRatio >= 1
    ? 'text-success'
    : coverageRatio >= 0.9
    ? 'text-warning'
    : 'text-destructive';

  const gaugeValue = Math.max(0, Math.min(coverageRatio * 100, 150));
  const gaugeData = [{ name: 'progress', value: gaugeValue, fill: gaugeColor }];

  return (
    <Panel
      title="Runway"
      description="What a day of running costs, and whether this month's revenue covers this month's costs."
    >
      <div className="grid grid-cols-1 gap-6 pb-3 pt-1 lg:grid-cols-2">
        {/* Cost per day */}
        <div>
          <p className="text-[13px] text-muted-foreground">Recorded cost per day</p>
          <p className="figure text-4xl font-bold">{hasCostPerDay ? formatCurrency(runway.costPerDay) : 'None yet'}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {hasCostPerDay
              ? `${formatCurrency(runway.trailing30Expenses)} recorded in the last 30 days, over 30 calendar days`
              : 'Record expenses to see a cost-per-day run rate.'}
          </p>

          <ul className="mt-3 divide-y border-t">
            {hasExpenses ? (
              runway.expenseBreakdown.map((entry) => (
                <li key={entry.expenseType} className="flex items-baseline justify-between gap-3 py-1.5 text-[14px]">
                  <span className="truncate text-muted-foreground">{entry.expenseType}</span>
                  <span className="figure">{formatCurrency(entry.amount)}</span>
                </li>
              ))
            ) : (
              <li className="py-2 text-[14px] text-muted-foreground">No expenses recorded in the last 30 days.</li>
            )}
            <li className="flex items-baseline justify-between gap-3 py-1.5 text-[14px]">
              <span className="text-muted-foreground">Last 90 days recorded</span>
              <span className="figure">{formatCurrency(runway.trailing90Expenses)}</span>
            </li>
          </ul>
        </div>

        {/* This month: revenue against costs */}
        <div className="flex flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">This month, revenue against recorded costs</p>
            <span className={cn('text-[13px] font-semibold', statusClass)}>{statusLabel}</span>
          </div>

          <div className="relative mt-1 h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={gaugeData} startAngle={180} endAngle={0} cy="90%">
                <PolarAngleAxis type="number" domain={[0, 150]} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={8} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-2">
              <p className={cn('figure text-3xl font-bold', statusClass)}>{hasMonthCosts ? `${coverageRatio.toFixed(1)}×` : 'None yet'}</p>
              <p className="text-[13px] text-muted-foreground">revenue to costs</p>
            </div>
          </div>

          <dl className="mt-2 grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-[13px] text-muted-foreground">Revenue</dt>
              <dd className="figure text-base font-semibold">{formatCurrency(runway.monthToDateRevenue)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Costs</dt>
              <dd className="figure text-base font-semibold">{hasMonthCosts ? formatCurrency(runway.monthToDateExpenses) : 'None yet'}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Left over</dt>
              <dd className={cn('figure text-base font-semibold', !hasMonthCosts ? 'text-muted-foreground' : delta >= 0 ? 'text-success' : 'text-destructive')}>
                {hasMonthCosts ? money(delta) : 'None yet'}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-center text-[13px] text-muted-foreground">
            {runway.monthToDateDays} delivery day{runway.monthToDateDays === 1 ? '' : 's'} this month
            {hasDispatch && <>, {runway.plannedDispatchDays} of the last 30</>}
            {runway.activeTrucksMTD > 0 && <>, {runway.activeTrucksMTD} active truck{runway.activeTrucksMTD === 1 ? '' : 's'}</>}
          </p>
        </div>
      </div>
    </Panel>
  );
}
