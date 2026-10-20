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
import { Panel, PanelHead } from '@/components/driver/ui/driver-ui';

interface Props {
  settlement: SettlementRow;
  items: SettlementItem[];
  loads: PeriodLoad[];
  accessorials: PeriodAccessorial[];
  netSettlementValue: number;
}

function Line({ label, amount, sub, tone, strong }: { label: string; amount: number; sub?: string; tone?: 'plus' | 'minus'; strong?: boolean }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
      <span className="min-w-0">
        <span className={strong ? 'block text-sm font-semibold' : 'block text-sm'}>{label}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className={`shrink-0 text-sm tabular-nums ${strong ? 'font-semibold' : ''} ${tone === 'plus' ? 'text-success' : tone === 'minus' ? 'text-destructive' : ''}`}>
        {tone === 'minus' && amount > 0 ? '-' : ''}{formatCurrency(amount)}
      </span>
    </li>
  );
}

function sumWhere(accessorials: PeriodAccessorial[], re: RegExp): { total: number; count: number } {
  const matches = accessorials.filter((a) => re.test(a.accessorial_type));
  return { total: matches.reduce((s, a) => s + Number(a.amount ?? 0), 0), count: matches.length };
}

const lineItems = (n: number) => (n > 0 ? `${n} line item${n === 1 ? '' : 's'}` : 'None this period');

/** The settlement's money in three cards: what came in, what was taken out, and the totals. */
export function SettlementAccordions({ settlement, items, loads, accessorials, netSettlementValue }: Props) {
  const linehaul = loads.reduce((s, l) => s + Number(l.rate ?? 0), 0);
  const fsc = sumWhere(accessorials, FSC_RE);
  const detention = sumWhere(accessorials, DETENTION_RE);
  const otherAccessorials = {
    total: accessorials.reduce((s, a) => s + Number(a.amount ?? 0), 0) - fsc.total - detention.total,
    count: accessorials.length - fsc.count - detention.count,
  };
  const reimbursements = items.filter((i) => i.item_type === 'reimbursement').reduce((s, i) => s + Number(i.amount ?? 0), 0);

  const deductions = items.filter((i) => i.item_type === 'deduction');
  const grouped = { fuel_advance: 0, trailer: 0, escrow: 0, insurance: 0, agency: 0, other: 0 } as Record<string, number>;
  for (const d of deductions) {
    const bucket = bucketDeduction(d.description);
    grouped[bucket] = (grouped[bucket] ?? 0) + Number(d.amount ?? 0);
  }
  const totalDeductions = deductions.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const grossRevenue = Number(settlement.gross_pay ?? 0);

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHead title="Revenue" />
        <ul className="divide-y divide-border">
          <Line label="Booked linehaul" sub={`${loads.length} delivered load${loads.length === 1 ? '' : 's'}`} amount={linehaul} tone="plus" />
          <Line label="100% fuel surcharge" sub={lineItems(fsc.count)} amount={fsc.total} tone="plus" />
          <Line label="Detention, lumpers and stop pay" sub={lineItems(detention.count)} amount={detention.total} tone="plus" />
          {otherAccessorials.count > 0 && <Line label="Other accessorials" sub={lineItems(otherAccessorials.count)} amount={otherAccessorials.total} tone="plus" />}
          {reimbursements > 0 && <Line label="Reimbursements" amount={reimbursements} tone="plus" />}
        </ul>
      </Panel>

      <Panel>
        <PanelHead title="Deductions" />
        <ul className="divide-y divide-border">
          <Line label="Fuel card advances" amount={grouped.fuel_advance} tone="minus" />
          <Line label="Trailer rental" amount={grouped.trailer} tone="minus" />
          <Line label="Escrow and maintenance reserve" amount={grouped.escrow} tone="minus" />
          <Line label="Insurance (bobtail, occupational accident)" amount={grouped.insurance} tone="minus" />
          <Line label="Brokerage and agency split" amount={grouped.agency} tone="minus" />
          {grouped.other > 0 && <Line label="Other deductions" amount={grouped.other} tone="minus" />}
        </ul>
      </Panel>

      <Panel>
        <PanelHead title="Totals" />
        <ul className="divide-y divide-border">
          <Line label="Gross revenue" amount={grossRevenue} strong />
          <Line label="Total deductions" amount={totalDeductions} tone="minus" />
          <li className="flex min-h-14 items-center justify-between gap-3 bg-secondary px-4 py-3">
            <span className="text-sm font-semibold">Final net settlement</span>
            <span className="font-condensed text-2xl font-bold tabular-nums text-success">{formatCurrency(netSettlementValue)}</span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}
