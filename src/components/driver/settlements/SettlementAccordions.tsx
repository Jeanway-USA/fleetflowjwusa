import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { formatCurrency } from '@/lib/formatters';
import {
  bucketDeduction,
  DETENTION_RE,
  FSC_RE,
  type PeriodAccessorial,
  type PeriodLoad,
  type SettlementItem,
  type SettlementRow,
} from '@/hooks/useDriverSettlementsPage';

interface Props {
  settlement: SettlementRow;
  items: SettlementItem[];
  loads: PeriodLoad[];
  accessorials: PeriodAccessorial[];
  netSettlementValue: number;
}

function Row({
  label,
  amount,
  sub,
  emphasis,
}: {
  label: string;
  amount: number;
  sub?: string;
  emphasis?: 'positive' | 'negative' | 'total';
}) {
  const color =
    emphasis === 'positive'
      ? 'text-success'
      : emphasis === 'negative'
        ? 'text-destructive'
        : emphasis === 'total'
          ? 'text-foreground font-semibold'
          : 'text-foreground';
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <p className={`text-sm tabular-nums ${color}`}>{formatCurrency(amount)}</p>
    </div>
  );
}

function sumWhere(
  accessorials: PeriodAccessorial[],
  re: RegExp,
): { total: number; count: number } {
  const matches = accessorials.filter((a) => re.test(a.accessorial_type));
  return {
    total: matches.reduce((s, a) => s + Number(a.amount ?? 0), 0),
    count: matches.length,
  };
}

export function SettlementAccordions({
  settlement,
  items,
  loads,
  accessorials,
  netSettlementValue,
}: Props) {
  const linehaul = loads.reduce((s, l) => s + Number(l.rate ?? 0), 0);
  const fsc = sumWhere(accessorials, FSC_RE);
  const detention = sumWhere(accessorials, DETENTION_RE);
  const otherAccessorials = {
    total:
      accessorials.reduce((s, a) => s + Number(a.amount ?? 0), 0) -
      fsc.total -
      detention.total,
    count: accessorials.length - fsc.count - detention.count,
  };

  const reimbursements = items
    .filter((i) => i.item_type === 'reimbursement')
    .reduce((s, i) => s + Number(i.amount ?? 0), 0);

  const deductions = items.filter((i) => i.item_type === 'deduction');
  const grouped = {
    fuel_advance: 0,
    trailer: 0,
    escrow: 0,
    insurance: 0,
    agency: 0,
    other: 0,
  } as Record<string, number>;
  for (const d of deductions) {
    const bucket = bucketDeduction(d.description);
    grouped[bucket] = (grouped[bucket] ?? 0) + Number(d.amount ?? 0);
  }
  const totalDeductions = deductions.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const grossRevenue = Number(settlement.gross_pay ?? 0);

  return (
    <Accordion
      type="multiple"
      defaultValue={['revenue', 'deductions', 'totals']}
      className="w-full"
    >
      <AccordionItem value="revenue">
        <AccordionTrigger className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue
        </AccordionTrigger>
        <AccordionContent>
          <div className="px-1">
            <Row
              label="Booked Linehaul"
              sub={`${loads.length} delivered load${loads.length === 1 ? '' : 's'}`}
              amount={linehaul}
              emphasis="positive"
            />
            <Row
              label="100% Fuel Surcharge (FSC)"
              sub={fsc.count > 0 ? `${fsc.count} line item${fsc.count === 1 ? '' : 's'}` : '—'}
              amount={fsc.total}
              emphasis="positive"
            />
            <Row
              label="Detention / Lumpers / Stop Pay"
              sub={
                detention.count > 0
                  ? `${detention.count} line item${detention.count === 1 ? '' : 's'}`
                  : '—'
              }
              amount={detention.total}
              emphasis="positive"
            />
            {otherAccessorials.count > 0 && (
              <Row
                label="Other Accessorials"
                sub={`${otherAccessorials.count} line item${otherAccessorials.count === 1 ? '' : 's'}`}
                amount={otherAccessorials.total}
                emphasis="positive"
              />
            )}
            {reimbursements > 0 && (
              <Row
                label="Reimbursements"
                amount={reimbursements}
                emphasis="positive"
              />
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="deductions">
        <AccordionTrigger className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Deductions
        </AccordionTrigger>
        <AccordionContent>
          <div className="px-1">
            <Row label="Fuel Card Advances" amount={grouped.fuel_advance} emphasis="negative" />
            <Row label="Trailer Rental" amount={grouped.trailer} emphasis="negative" />
            <Row
              label="Escrow / Maintenance Reserve"
              amount={grouped.escrow}
              emphasis="negative"
            />
            <Row
              label="Insurance (Bobtail / OccAcc)"
              amount={grouped.insurance}
              emphasis="negative"
            />
            <Row
              label="Brokerage / Agency Split"
              amount={grouped.agency}
              emphasis="negative"
            />
            {grouped.other > 0 && (
              <Row label="Other Deductions" amount={grouped.other} emphasis="negative" />
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="totals">
        <AccordionTrigger className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Totals
        </AccordionTrigger>
        <AccordionContent>
          <div className="px-1">
            <Row label="Gross Revenue" amount={grossRevenue} emphasis="total" />
            <Row label="Total Deductions" amount={totalDeductions} emphasis="negative" />
            <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-border">
              <p className="text-sm font-bold uppercase tracking-wider text-foreground">
                Final Net Settlement
              </p>
              <p className="text-lg font-bold text-success tabular-nums">
                {formatCurrency(netSettlementValue)}
              </p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
