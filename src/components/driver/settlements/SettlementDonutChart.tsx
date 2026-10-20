import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** A CSS colour, for example `hsl(var(--success))`. */
  color: string;
}

interface Props {
  total: number;
  slices: DonutSlice[];
}

/**
 * Where a settlement's gross went, as one split bar and a legend. (The file keeps its old name so imports stay;
 * the donut chart it used to draw is gone: a bar reads better at phone width and shows the same shares.)
 */
export function SettlementDonutChart({ total, slices }: Props) {
  const positive = slices.filter((s) => s.value > 0);
  const sum = positive.reduce((s, x) => s + x.value, 0) || total || 1;

  return (
    <div>
      <div role="img" aria-label="How your gross pay was split" className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {positive.map((s) => (
          <span key={s.key} style={{ width: `${(s.value / sum) * 100}%`, background: s.color }} className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-3 divide-y divide-border">
        {slices.map((s) => {
          const pct = sum > 0 ? (s.value / sum) * 100 : 0;
          return (
            <li key={s.key} className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5 text-sm">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{formatCurrency(s.value)}</span>
                <span className={cn('block text-xs tabular-nums text-muted-foreground', s.value <= 0 && 'opacity-0')}>{pct.toFixed(1)}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
