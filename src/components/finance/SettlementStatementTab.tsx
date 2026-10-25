import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { settlementWeek } from '@/lib/settlement-week';
import {
  buildSettlementStatement,
  type StatementCharge,
  type StatementExpense,
  type StatementLoad,
  type StatementTripLine,
} from '@/lib/settlement-statement';

interface SettlementStatementTabProps {
  loads: StatementLoad[];
  expenses: StatementExpense[];
  truckId: string;
  isLoading: boolean;
  onUpload: () => void;
}

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));
/** Deductions read as minus amounts, the way the statement lists them. */
const takeOff = (v: number) => (v > 0 ? `−${formatCurrency(v)}` : formatCurrency(0));

function Line({ label, note, value, strong, rule, muted }: {
  label: string;
  note?: React.ReactNode;
  value: string;
  strong?: boolean;
  rule?: 'single' | 'double';
  muted?: boolean;
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
      <div className={cn('figure shrink-0 text-right', strong ? 'text-2xl font-bold' : 'text-lg font-semibold', muted && 'text-muted-foreground')}>
        {value}
      </div>
    </div>
  );
}

function SectionHeading({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2">
      <h3 id={id} className="font-condensed text-lg font-bold leading-tight">{children}</h3>
      {aside && <span className="text-[13px] text-muted-foreground tabular-nums">{aside}</span>}
    </div>
  );
}

function TripRows({ trips }: { trips: StatementTripLine[] }) {
  // Advance and fee columns only appear once the statement's charges are imported.
  const showAdvances = trips.some((t) => t.advances > 0);
  const showFees = trips.some((t) => t.fees > 0);
  const showAccessorials = trips.some((t) => t.accessorials > 0);
  return (
    <>
      {/* Phone: one block per trip */}
      <ul className="divide-y border-t md:hidden">
        {trips.map((t) => (
          <li key={t.loadId} className="px-4 py-3">
            <div className="flex items-baseline gap-3">
              <span className="font-condensed text-lg font-bold leading-tight">{t.trip || 'No trip number'}</span>
              {t.agency && <span className="text-[13px] text-muted-foreground">{t.agency}</span>}
              <span className="figure ml-auto text-lg font-bold">{money(t.net)}</span>
            </div>
            <div className="text-[13px] text-muted-foreground">
              {t.route || 'Older trip, charges only'}
              {t.deliveryDate && <> · delivered {format(parseISO(t.deliveryDate), 'MMM d')}</>}
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] tabular-nums">
              <div className="flex justify-between"><dt className="text-muted-foreground">Linehaul</dt><dd>{money(t.linehaul)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Fuel surcharge</dt><dd>{money(t.fuelSurcharge)}</dd></div>
              {t.accessorials > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Accessorials</dt><dd>{money(t.accessorials)}</dd></div>}
              {t.advances > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Card advance</dt><dd>{takeOff(t.advances)}</dd></div>}
              {t.fees > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Fees</dt><dd>{takeOff(t.fees)}</dd></div>}
            </dl>
            {t.discrepancy && <p className="mt-1 text-[13px] font-medium text-destructive">Differs from Landstar's statement</p>}
          </li>
        ))}
      </ul>

      {/* Desktop: the statement's columns */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-t text-[15px]">
          <caption className="sr-only">Trips settling this week</caption>
          <thead>
            <tr className="border-b text-left text-[12px] font-semibold text-muted-foreground">
              <th scope="col" className="px-4 py-2">Trip</th>
              <th scope="col" className="py-2">Route</th>
              <th scope="col" className="py-2 text-right">Linehaul</th>
              <th scope="col" className="py-2 text-right">Fuel surcharge</th>
              {showAccessorials && <th scope="col" className="py-2 text-right">Accessorials</th>}
              <th scope="col" className="py-2 text-right">Revenue</th>
              {showAdvances && <th scope="col" className="py-2 text-right">Card advance</th>}
              {showFees && <th scope="col" className="py-2 text-right">Fees</th>}
              {(showAdvances || showFees) && <th scope="col" className="px-4 py-2 text-right">Net</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {trips.map((t) => (
              <tr key={t.loadId} className="align-top">
                <td className="px-4 py-2.5">
                  <div className="font-condensed text-lg font-bold leading-tight">{t.trip || 'No trip number'}</div>
                  <div className="text-[13px] text-muted-foreground">
                    {t.agency}{t.agency && t.deliveryDate ? ' · ' : ''}{t.deliveryDate && format(parseISO(t.deliveryDate), 'MMM d')}
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {t.route || 'Older trip, charges only'}
                  {t.discrepancy && <div className="text-[13px] font-medium text-destructive">Differs from Landstar's statement</div>}
                </td>
                <td className="figure py-2.5 text-right">{money(t.linehaul)}</td>
                <td className="figure py-2.5 text-right">{money(t.fuelSurcharge)}</td>
                {showAccessorials && <td className="figure py-2.5 text-right">{t.accessorials ? money(t.accessorials) : ''}</td>}
                <td className={cn('figure py-2.5 text-right', !(showAdvances || showFees) ? 'px-4 text-lg font-bold' : 'font-semibold')}>{money(t.revenue)}</td>
                {showAdvances && <td className="figure py-2.5 text-right">{t.advances ? takeOff(t.advances) : ''}</td>}
                {showFees && <td className="figure py-2.5 text-right">{t.fees ? takeOff(t.fees) : ''}</td>}
                {(showAdvances || showFees) && <td className="figure px-4 py-2.5 text-right text-lg font-bold">{money(t.net)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ChargeList({ charges }: { charges: StatementCharge[] }) {
  return (
    <ul className="divide-y border-t">
      {charges.map((c) => (
        <li key={c.id} className="flex items-baseline gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px]">{c.description}</div>
            <div className="text-[13px] text-muted-foreground">{c.label}, {format(parseISO(c.date), 'MMM d')}</div>
          </div>
          <div className="figure shrink-0 text-lg font-semibold">{takeOff(c.amount)}</div>
        </li>
      ))}
    </ul>
  );
}

export function SettlementStatementTab({ loads, expenses, truckId, isLoading, onUpload }: SettlementStatementTabProps) {
  // Opens on the last finished settlement week: that is the statement Landstar has issued.
  const [offset, setOffset] = useState(-1);
  const week = useMemo(() => settlementWeek(new Date(), offset), [offset]);
  const weekStart = week.isoDays[0];
  const weekEnd = week.isoDays[6];

  const statement = useMemo(
    () => buildSettlementStatement({ loads, expenses, weekStart, weekEnd, truckId }),
    [loads, expenses, weekStart, weekEnd, truckId],
  );

  const { totals, card } = statement;
  const scheduled = statement.charges.filter((c) => c.group === 'scheduled');
  const adjustments = statement.charges.filter((c) => c.group === 'adjustment');
  const scheduledTotal = scheduled.reduce((s, c) => s + c.amount, 0);
  const adjustmentTotal = adjustments.reduce((s, c) => s + c.amount, 0);
  const hasAnything = statement.trips.length > 0 || statement.hasStatementLines || statement.waiting.length > 0;
  const inProgress = offset >= 0;
  const avgPerGallon = card.fuelGallons > 0 ? (card.fuelSpend - card.discounts) / card.fuelGallons : 0;

  return (
    <div className="space-y-5">
      <section aria-labelledby="statement-week" className="rounded-lg border bg-card px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="statement-week" className="font-condensed text-xl font-bold leading-tight">
              Week ending {format(week.end, 'EEE, MMM d')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {inProgress ? 'Still in progress, Landstar has not issued this statement' : `Thu ${format(week.start, 'MMM d')} to Wed ${format(week.end, 'MMM d')}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {isLoading ? (
              <Skeleton className="ml-auto h-9 w-28" />
            ) : (
              <div className="figure text-[34px] font-bold leading-none">{money(totals.net)}</div>
            )}
            <div className="mt-1 text-[13px] text-muted-foreground">
              {statement.hasStatementLines ? 'net for the week' : "revenue, before Landstar's charges"}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          {offset !== -1 && (
            <Button variant="ghost" size="sm" className="mr-auto h-11" onClick={() => setOffset(-1)}>
              Last statement
            </Button>
          )}
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Next week" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </section>

      {!isLoading && !hasAnything && (
        <section className="rounded-lg border bg-card px-4 py-6">
          <p className="text-[15px] font-medium">Nothing settled this week.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No delivered loads and no Landstar statement lines fall between {format(week.start, 'MMM d')} and {format(week.end, 'MMM d')}. Use the arrows to look at another week.
          </p>
        </section>
      )}

      {!isLoading && hasAnything && (
        <>
          {!statement.hasStatementLines && (
            <section role="status" className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">Landstar's charges for this week are not imported yet.</span>{' '}
                Revenue below comes from your loads. The net will drop once the statement is uploaded.
              </p>
              <Button variant="outline" className="h-11 shrink-0 gap-2" onClick={onUpload}>
                <Upload className="h-4 w-4" /> Upload statement
              </Button>
            </section>
          )}

          <section aria-label="Statement totals" className="rounded-lg border bg-card px-4 pt-1 pb-1 md:max-w-2xl">
            <Line
              label="Revenue"
              note={`${statement.trips.filter((t) => !t.chargesOnly).length} trips, 65% of linehaul plus fuel surcharge`}
              value={money(totals.revenue)}
            />
            {statement.hasStatementLines && (
              <>
                <Line label="Card advances" note="Pre-trip money Landstar loaded on your fuel card" value={takeOff(totals.advances)} muted rule="single" />
                <Line label="Card and scanning fees" note="Per trip" value={takeOff(totals.fees)} muted />
                {scheduled.length > 0 && <Line label="Scheduled deductions" note={`${scheduled.length} lines: insurance, satellite, loans and the like`} value={takeOff(scheduledTotal)} muted />}
                {adjustments.length > 0 && <Line label="Other adjustments" note="Tolls and fuel tax" value={takeOff(adjustmentTotal)} muted />}
                <Line label="Net" strong rule="double" note="Revenue less every deduction above" value={money(totals.net)} />
              </>
            )}
          </section>

          {statement.trips.length > 0 && (
            <section aria-labelledby="statement-trips" className="overflow-hidden rounded-lg border bg-card">
              <SectionHeading id="statement-trips" aside={`${statement.trips.length} ${statement.trips.length === 1 ? 'trip' : 'trips'}`}>
                Trips
              </SectionHeading>
              <TripRows trips={statement.trips} />
            </section>
          )}

          {statement.waiting.length > 0 && (
            <section aria-labelledby="statement-waiting" className="overflow-hidden rounded-lg border border-dashed bg-card">
              <SectionHeading id="statement-waiting" aside={`${statement.waiting.length} ${statement.waiting.length === 1 ? 'trip' : 'trips'}`}>
                Delivered, waiting for Landstar
              </SectionHeading>
              <p className="px-4 pb-2 text-[13px] text-muted-foreground">
                Landstar has not settled {statement.waiting.length === 1 ? 'this trip' : 'these trips'} yet, so {statement.waiting.length === 1 ? 'it is' : 'they are'} not in the totals above. {statement.waiting.length === 1 ? 'It' : 'They'} will land on the statement for the week Landstar scans and settles {statement.waiting.length === 1 ? 'it' : 'them'}.
              </p>
              <TripRows trips={statement.waiting} />
            </section>
          )}

          {scheduled.length > 0 && (
            <section aria-labelledby="statement-scheduled" className="overflow-hidden rounded-lg border bg-card">
              <SectionHeading id="statement-scheduled" aside={takeOff(scheduledTotal)}>Scheduled deductions</SectionHeading>
              <ChargeList charges={scheduled} />
            </section>
          )}

          {adjustments.length > 0 && (
            <section aria-labelledby="statement-adjustments" className="overflow-hidden rounded-lg border bg-card">
              <SectionHeading id="statement-adjustments" aside={takeOff(adjustmentTotal)}>Other adjustments</SectionHeading>
              <ChargeList charges={adjustments} />
            </section>
          )}

          {(card.loaded > 0 || card.fuel.length > 0 || card.cashToBank > 0) && (
            <section aria-labelledby="statement-card" className="rounded-lg border bg-card px-4 pt-1 pb-2 md:max-w-2xl">
              <h3 id="statement-card" className="pt-2 font-condensed text-lg font-bold leading-tight">Fuel card</h3>
              <p className="pb-1 text-[13px] text-muted-foreground">What the card spent. This is card activity, not a Landstar deduction.</p>
              <Line label="Loaded on the card" note="Matches the card advances above" value={money(card.loaded)} rule="single" />
              <Line
                label="Fuel"
                note={card.fuelGallons > 0 ? `${card.fuelGallons.toLocaleString('en-US', { maximumFractionDigits: 1 })} gallons, ${formatCurrency(avgPerGallon)} a gallon after discounts` : undefined}
                value={money(card.fuelSpend)}
              />
              {card.defSpend > 0 && <Line label="DEF" value={money(card.defSpend)} />}
              {card.discounts > 0 && <Line label="Fuel discounts" value={`−${formatCurrency(card.discounts)}`} muted />}
              {card.cashToBank > 0 && <Line label="Cash sent to your bank" value={money(card.cashToBank)} rule="single" />}

              {card.fuel.length > 0 && (
                <details className="border-t pt-2">
                  <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-medium">
                    {card.fuel.length} card purchases
                  </summary>
                  <ul className="divide-y">
                    {card.fuel.map((f) => (
                      <li key={f.id} className="flex items-baseline gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px]">{f.place}</div>
                          <div className="text-[13px] text-muted-foreground">
                            {format(parseISO(f.date), 'MMM d')}{f.gallons ? `, ${f.gallons} gal` : ''}{f.isDef ? ', DEF' : ''}
                          </div>
                        </div>
                        <div className="figure shrink-0 text-base font-semibold">{money(f.amount)}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
