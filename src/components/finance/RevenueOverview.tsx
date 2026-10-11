import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatters';
import { bySeries, compare, periodLabel, summarize, yearToDatePair, type Comparison, type OverviewLoad, type OverviewPeriod } from '@/lib/revenue-overview';
import { Panel, StatementLine } from '@/components/finance/statement-ui';

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));
const whole = (v: number) => formatCurrency(v, { maximumFractionDigits: 0 });
const perMile = (v: number) => (v > 0 ? `${formatCurrency(v)} a mile` : 'No miles yet');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PERIODS: Array<{ value: OverviewPeriod; label: string; singular: string }> = [
  { value: 'week', label: 'Weekly', singular: 'week' },
  { value: 'month', label: 'Monthly', singular: 'month' },
  { value: 'quarter', label: 'Quarterly', singular: 'quarter' },
];

const chartConfig: ChartConfig = {
  thisYear: { label: 'This year', color: 'hsl(var(--primary))' },
  lastYear: { label: 'Last year', color: 'hsl(var(--muted-foreground))' },
};

function changeNote(label: string, c: Comparison, format: (v: number) => string): { note: string; tone: 'good' | 'bad' | undefined } {
  if (c.previous === 0) return { note: 'No delivered loads recorded last year', tone: undefined };
  const sign = c.change >= 0 ? '+' : '−';
  return {
    note: `${label}: ${format(c.previous)} (${sign}${format(Math.abs(c.change))}${c.percent !== null ? `, ${sign}${Math.abs(c.percent).toLocaleString()}%` : ''})`,
    tone: c.change >= 0 ? 'good' : 'bad',
  };
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label="Revenue period by period">
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The owner's view of the money, laid out the way Landstar's BCO Analytics lays it out: the all-in gross before
 * Landstar's cut, what you actually earn after it, where that revenue comes from, and how it compares with last year.
 */
export function RevenueOverview() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [period, setPeriod] = useState<OverviewPeriod>('week');

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['revenue-overview', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('delivery_date, gross_revenue, net_revenue, truck_revenue, fuel_surcharge, accessorials, booked_miles, actual_miles, truck_id')
        .is('deleted_at', null)
        .eq('status', 'delivered')
        .gte('delivery_date', `${year - 1}-01-01`)
        .lte('delivery_date', `${year}-12-31`);
      if (error) throw error;
      return (data ?? []) as OverviewLoad[];
    },
  });

  const view = useMemo(() => {
    const yearLoads = loads.filter((l) => l.delivery_date?.startsWith(String(year)));
    const totals = summarize(yearLoads);
    const pair = yearToDatePair(loads, year, new Date());
    const series = bySeries(yearLoads, period);
    const top = series.reduce<(typeof series)[number] | null>((best, row) => (!best || row.yours > best.yours ? row : best), null);
    const monthly = MONTHS.map((month, i) => {
      const key = `${String(i + 1).padStart(2, '0')}`;
      const sum = (y: number) => summarize(loads.filter((l) => l.delivery_date?.startsWith(`${y}-${key}`))).yours;
      // The months still ahead have no revenue yet; leave them off the line instead of dropping it to zero.
      const ahead = year === new Date().getFullYear() && i > new Date().getMonth();
      return { month, thisYear: ahead ? null : sum(year), lastYear: sum(year - 1) };
    });
    return { totals, pair, series, top, monthly };
  }, [loads, year, period]);

  const { totals, pair, series, top, monthly } = view;
  const singular = PERIODS.find((p) => p.value === period)!.singular;
  const revenueChange = changeNote('Last year', compare(pair.current.yours, pair.previous.yours), whole);
  const shipmentChange = changeNote('Last year', compare(pair.current.shipments, pair.previous.shipments), (v) => v.toLocaleString());
  const milesChange = changeNote('Last year', compare(pair.current.billedMiles, pair.previous.billedMiles), (v) => v.toLocaleString());
  const years = Array.from({ length: 5 }, (_, i) => thisYear - i);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-condensed text-xl font-bold leading-tight">Revenue overview</h3>
          <p className="text-[13px] text-muted-foreground">Delivered loads, counted on the day they delivered.</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-11 w-32" aria-label="Year"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="All-in rate" description="What customers were billed in all, what Landstar kept, and what you earned.">
          <StatementLine label="Billed to customers" note={`All-in gross: linehaul, fuel surcharge and accessorials. ${totals.shipments.toLocaleString()} loads, ${totals.billedMiles.toLocaleString()} billed miles.`} value={isLoading ? '…' : money(totals.gross)} />
          <StatementLine label="Landstar's cut" note="Their share of linehaul. Fuel surcharge and accessorials come to you." value={isLoading ? '…' : `−${formatCurrency(totals.landstarCut)}`} rule="single" />
          <StatementLine label="Your 1099 revenue" note="What you actually earn after Landstar's cut." value={isLoading ? '…' : money(totals.yours)} strong rule="double" />
          <StatementLine label="All-in rate" note="Billed to customers per billed mile" value={perMile(totals.allInRate)} muted rule="single" />
          <StatementLine label="Your rate" note="Your revenue per billed mile, after Landstar's cut" value={perMile(totals.netRate)} muted rule="single" />
        </Panel>

        <Panel title="Where your revenue comes from" description="Your 1099 revenue, split the way Landstar's analytics splits it.">
          <StatementLine label="Linehaul" note="Your share of the linehaul rate" value={money(totals.linehaul)} />
          <StatementLine label="Fuel surcharge" note="Paid to you in full" value={money(totals.fuelSurcharge)} rule="single" />
          <StatementLine label="Other accessorials" note="Detention, stop-offs, loading and unloading" value={money(totals.accessorials)} rule="single" />
          <StatementLine label="Your 1099 revenue" value={money(totals.yours)} strong rule="double" />
          <StatementLine label="Shipments" value={totals.shipments.toLocaleString()} muted rule="single" />
          <StatementLine label="Billed miles" value={totals.billedMiles.toLocaleString()} muted rule="single" />
          <StatementLine label="Tractors" note="With a delivered load this year" value={totals.tractors} muted rule="single" />
        </Panel>
      </div>

      <Panel
        title={year === thisYear ? 'This year so far, against last year' : `${year}, against ${year - 1}`}
        description="Your 1099 revenue, shipments and billed miles, and the best stretch of the year."
        aside={
          <div className="flex rounded-md border" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant="ghost"
                aria-pressed={period === p.value}
                className={`h-11 rounded-none px-4 first:rounded-l-md last:rounded-r-md ${period === p.value ? 'bg-muted font-semibold' : ''}`}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      >
        <StatementLine label="1099 revenue" note={revenueChange.note} value={whole(pair.current.yours)} tone={revenueChange.tone} />
        <StatementLine label="Shipments" note={shipmentChange.note} value={pair.current.shipments.toLocaleString()} tone={shipmentChange.tone} rule="single" />
        <StatementLine label="Billed miles" note={milesChange.note} value={pair.current.billedMiles.toLocaleString()} tone={milesChange.tone} rule="single" />
        <StatementLine
          label={`Best ${singular}`}
          note={top ? `${periodLabel(top.key, period)}: ${top.shipments} ${top.shipments === 1 ? 'load' : 'loads'}, ${top.billedMiles.toLocaleString()} billed miles` : 'No delivered loads yet'}
          value={top ? whole(top.yours) : '—'}
          rule="single"
        />
        <div className="border-t py-3">
          <p className="text-[13px] text-muted-foreground">Your revenue {singular} by {singular}, {year}</p>
          <Sparkline values={series.map((s) => s.yours)} />
        </div>
      </Panel>

      <Panel title="Revenue by month" description={`Your 1099 revenue each month of ${year}, against ${year - 1}.`}>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <LineChart data={monthly} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`)} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="lastYear" stroke="var(--color-lastYear)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="thisYear" stroke="var(--color-thisYear)" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      </Panel>
    </div>
  );
}
