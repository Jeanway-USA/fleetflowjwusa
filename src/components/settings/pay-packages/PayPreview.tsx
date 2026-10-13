import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculatePackagePay } from '@/lib/pay-packages/engine';
import { EMPTY_WEEK, type PayComponent, type PayWeekInput } from '@/lib/pay-packages/types';
import { formatCurrency } from '@/lib/formatters';

/** A typical week to try a package against. These are only sample numbers for the preview. */
const SAMPLE: PayWeekInput = {
  ...EMPTY_WEEK,
  periodStart: '2026-01-01',
  periodEnd: '2026-01-07',
  miles: 2000,
  grossRevenue: 6000,
  netRevenue: 4800,
  loadCount: 3,
  daysWorked: 5,
  accessorials: 150,
  detentionHours: 2,
  detentionPay: 100,
  incidents: 0,
};

const FIELDS: Array<{ key: keyof PayWeekInput; label: string; step?: string }> = [
  { key: 'miles', label: 'Miles' },
  { key: 'grossRevenue', label: 'Billed (gross)' },
  { key: 'netRevenue', label: 'Truck earned (net)' },
  { key: 'loadCount', label: 'Loads' },
  { key: 'daysWorked', label: 'Days worked' },
  { key: 'accessorials', label: 'Extra charges' },
  { key: 'detentionHours', label: 'Detention hours' },
  { key: 'detentionPay', label: 'Detention billed' },
  { key: 'incidents', label: 'Incidents' },
];

/** Works the package out against a sample week, live, as it is edited. */
export function PayPreview({ components }: { components: PayComponent[] }) {
  const [week, setWeek] = useState<PayWeekInput>(SAMPLE);
  const result = useMemo(() => calculatePackagePay(components, week), [components, week]);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Sample week</h4>
        <div className="grid grid-cols-2 gap-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                inputMode="decimal"
                className="h-10"
                value={String(week[f.key])}
                onChange={(e) => setWeek({ ...week, [f.key]: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border">
        {result.lines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Add a pay line to see what it pays.</p>
        ) : (
          <ul className="divide-y">
            {result.lines.map((l) => (
              <li key={l.componentId} className="flex items-start justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{l.label || 'Untitled line'}</span>
                  <span className="block text-xs text-muted-foreground">{l.error ?? l.detail}</span>
                </span>
                <span className={l.isDeduction ? 'tabular-nums text-destructive' : 'tabular-nums'}>
                  {l.isDeduction ? '−' : ''}
                  {formatCurrency(l.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-1 border-t bg-muted/40 p-3 text-sm">
          <div className="flex justify-between"><span>Taxable earnings</span><span className="tabular-nums">{formatCurrency(result.taxableGross)}</span></div>
          <div className="flex justify-between"><span>Not taxable</span><span className="tabular-nums">{formatCurrency(result.nonTaxable)}</span></div>
          <div className="flex justify-between"><span>Deductions</span><span className="tabular-nums">−{formatCurrency(result.deductions)}</span></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Pay before taxes</span><span className="tabular-nums">{formatCurrency(result.net)}</span></div>
        </div>
      </div>

      {result.errors.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {result.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
