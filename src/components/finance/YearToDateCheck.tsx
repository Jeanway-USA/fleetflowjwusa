import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, cityState } from '@/lib/formatters';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { latestSettlementWednesday } from '@/lib/settlement-reconciliation';

interface YtdLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string | null;
  destination: string | null;
  status: string | null;
  delivery_date: string | null;
  net_revenue: number | null;
  fuel_surcharge: number | null;
  accessorials: number | null;
}

interface YearToDateCheckProps {
  loads: YtdLoad[];
}

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));
const storageKey = (year: string) => `fleetflow.landstar-ytd.${year}`;

function readSaved(year: string): string {
  try {
    return window.localStorage.getItem(storageKey(year)) ?? '';
  } catch {
    return '';
  }
}

function writeSaved(year: string, value: string) {
  try {
    window.localStorage.setItem(storageKey(year), value);
  } catch {
    /* blocked storage: the figure just has to be typed again next visit */
  }
}

export function YearToDateCheck({ loads }: YearToDateCheckProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [landstarText, setLandstarText] = useState(() => readSaved(String(currentYear)));
  // A statement prints year-to-date earnings as of its own date, so compare loads up to that date.
  const [through, setThrough] = useState(() => latestSettlementWednesday(new Date()));

  // The figure is saved per year in this browser, so it is there next time.
  useEffect(() => {
    setLandstarText(readSaved(year));
    setThrough(Number(year) === currentYear ? latestSettlementWednesday(new Date()) : `${year}-12-31`);
  }, [year, currentYear]);
  const onLandstarChange = (value: string) => {
    setLandstarText(value);
    writeSaved(year, value);
  };

  // Landstar pays on delivery, so a load belongs to the year it was delivered.
  const ytdLoads = useMemo(
    () =>
      loads
        .filter((l) => l.status === 'delivered' && l.delivery_date && parseISO(l.delivery_date).getFullYear() === Number(year) && (!through || l.delivery_date <= through))
        .sort((a, b) => (a.delivery_date ?? '').localeCompare(b.delivery_date ?? '')),
    [loads, year, through],
  );

  const appTotal = ytdLoads.reduce((s, l) => s + (l.net_revenue ?? 0), 0);
  const fuelSurcharge = ytdLoads.reduce((s, l) => s + (l.fuel_surcharge ?? 0), 0);
  const accessorials = ytdLoads.reduce((s, l) => s + (l.accessorials ?? 0), 0);
  const linehaulShare = appTotal - fuelSurcharge - accessorials;

  const landstar = parseFloat(landstarText) || 0;
  const difference = landstar - appTotal;
  const matched = Math.abs(difference) < 1;
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  let running = 0;
  const rows = ytdLoads.map((l) => {
    running += l.net_revenue ?? 0;
    return { load: l, running };
  });

  return (
    <Panel
      title="Year to date, checked against Landstar"
      description="Every Landstar statement prints your year-to-date 1099 earnings. Enter that figure to see whether your loads add up to it."
    >
      <div className="grid gap-4 pb-3 pt-1 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="ytd-landstar">Landstar year-to-date 1099 earnings</Label>
          <CurrencyInput id="ytd-landstar" value={landstarText} onChange={onLandstarChange} placeholder="144415.71" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ytd-through">On the statement ending</Label>
          <Input id="ytd-through" type="date" className="h-11" value={through} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setThrough(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ytd-year">Year</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger id="ytd-year" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {landstar > 0 ? (
        <div className="border-t">
          <StatementLine label="Landstar says you have earned" value={money(landstar)} />
          <StatementLine
            label="Your loads add up to"
            note={`${ytdLoads.length} delivered ${ytdLoads.length === 1 ? 'load' : 'loads'}, ${year} through ${through ? format(parseISO(through), 'MMM d') : 'today'}`}
            value={money(appTotal)}
          />
          <StatementLine
            label={matched ? 'They match' : difference > 0 ? "Landstar's figure is higher by" : 'Your loads are higher by'}
            note={
              matched
                ? 'Within a dollar.'
                : difference > 0
                  ? 'Landstar paid for a load that is missing here, or a load is entered for less than Landstar paid. Loads delivered in late December and paid in January also count in Landstar\'s new year.'
                  : 'Usually loads delivered but not yet settled by Landstar, or a load entered for more than Landstar paid.'
            }
            value={matched ? money(0) : money(Math.abs(difference))}
            strong
            rule="double"
            tone={matched ? 'good' : undefined}
          />
        </div>
      ) : (
        <p className="border-t py-3 text-sm text-muted-foreground">Enter Landstar's figure to compare it with your loads.</p>
      )}

      <div className="border-t">
        <StatementLine label="Your share of linehaul" value={money(linehaulShare)} muted />
        <StatementLine label="Fuel surcharge" value={money(fuelSurcharge)} muted />
        <StatementLine label="Accessorials" value={money(accessorials)} muted />
      </div>

      <details className="border-t">
        <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-medium">
          Load by load, with a running total ({ytdLoads.length})
        </summary>
        {rows.length === 0 ? (
          <p className="pb-3 text-sm text-muted-foreground">No delivered loads in {year}.</p>
        ) : (
          <>
            <ul className="divide-y border-t md:hidden">
              {rows.map(({ load, running: total }) => (
                <li key={load.id} className="py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-condensed text-lg font-bold leading-tight">{load.landstar_load_id || 'No trip number'}</span>
                    <span className="figure ml-auto text-base font-semibold">{money(load.net_revenue ?? 0)}</span>
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {load.delivery_date && format(parseISO(load.delivery_date), 'MMM d')}, {cityState(load.origin)} to {cityState(load.destination)}
                  </div>
                  <div className="text-[13px] text-muted-foreground tabular-nums">Running total {money(total)}</div>
                </li>
              ))}
            </ul>
            <div className="hidden max-h-[28rem] overflow-auto border-t md:block">
              <table className="w-full text-[15px]">
                <caption className="sr-only">Delivered loads in {year} with a running total of your revenue</caption>
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2">Delivered</th>
                    <th scope="col" className="py-2">Trip</th>
                    <th scope="col" className="py-2">Route</th>
                    <th scope="col" className="py-2 text-right">Your revenue</th>
                    <th scope="col" className="py-2 text-right">Running total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(({ load, running: total }) => (
                    <tr key={load.id}>
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{load.delivery_date && format(parseISO(load.delivery_date), 'MMM d')}</td>
                      <td className="py-2 pr-3 font-medium tabular-nums">{load.landstar_load_id || ''}</td>
                      <td className="max-w-[20rem] truncate py-2 pr-3 text-muted-foreground">{cityState(load.origin)} to {cityState(load.destination)}</td>
                      <td className="figure py-2 text-right font-semibold">{money(load.net_revenue ?? 0)}</td>
                      <td className="figure py-2 text-right">{money(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>
    </Panel>
  );
}
