import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/formatters';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** Tailwind/HSL token color. Pass CSS color values (e.g. `hsl(var(--success))`). */
  color: string;
}

interface Props {
  total: number;
  slices: DonutSlice[];
}

export function SettlementDonutChart({ total, slices }: Props) {
  const positive = slices.filter((s) => s.value > 0);
  const computedTotal = positive.reduce((s, x) => s + x.value, 0) || total || 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-6 items-center">
      <div className="relative h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={positive}
              dataKey="value"
              nameKey="label"
              innerRadius={70}
              outerRadius={110}
              paddingAngle={2}
              strokeWidth={0}
            >
              {positive.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                color: 'hsl(var(--popover-foreground))',
                fontSize: 12,
              }}
              formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Gross Revenue
          </p>
          <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {slices.map((s) => {
          const pct = computedTotal > 0 ? (s.value / computedTotal) * 100 : 0;
          return (
            <li
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: s.color }}
                />
                <span className="text-sm text-foreground truncate">{s.label}</span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {formatCurrency(s.value)}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {pct.toFixed(1)}%
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
