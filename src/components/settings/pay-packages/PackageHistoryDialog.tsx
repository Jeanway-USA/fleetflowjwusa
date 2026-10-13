import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { usePackageVersions } from '@/hooks/usePayPackages';
import { versionAsOf } from '@/lib/pay-packages/resolve';
import { COMPONENT_LABELS, METHOD_LABELS, type PayComponent } from '@/lib/pay-packages/types';
import { formatDate } from '@/lib/formatters';

function amountText(c: PayComponent) {
  if (c.calculation_method === 'formula') return c.formula || 'formula';
  return c.unit === 'percent' ? `${c.value}%` : `$${c.value}`;
}

function ComponentList({ components }: { components: PayComponent[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {components.map((c) => (
        <li key={c.id} className="flex items-start justify-between gap-3 p-3 text-sm">
          <span className="min-w-0">
            <span className="block font-medium">{c.label || 'Untitled line'}</span>
            <span className="block text-xs text-muted-foreground">
              {COMPONENT_LABELS[c.component_type]} · {METHOD_LABELS[c.calculation_method]}
              {!c.is_active && ' · off'}
            </span>
          </span>
          <span className="shrink-0 font-mono text-xs">{amountText(c)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Every saved version of a package, and the package as it stood on any past day. */
export function PackageHistoryDialog({ packageId, name, open, onOpenChange }: { packageId: string | null; name: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: versions = [], isLoading } = usePackageVersions(open ? packageId : null);
  const [asOf, setAsOf] = useState('');
  const onThatDay = useMemo(() => (asOf ? versionAsOf(versions, asOf) : null), [versions, asOf]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>History: {name}</DialogTitle>
          <DialogDescription>Every save is kept. Nothing here can be changed or removed.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto">
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <Label htmlFor="as-of">See the package as it was on</Label>
            <Input id="as-of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-11 max-w-[220px]" />
            {asOf && (
              onThatDay ? (
                <div className="space-y-2 pt-1">
                  <p className="text-sm">
                    On {formatDate(asOf)} this was <strong>version {onThatDay.version_number}</strong>, saved {formatDate(onThatDay.created_at.slice(0, 10))}.
                  </p>
                  <ComponentList components={onThatDay.snapshot.components} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This package had not been saved yet on that day.</p>
              )
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">All versions</h4>
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {versions.map((v, i) => (
              <details key={v.id} className="rounded-lg border p-3" open={i === 0}>
                <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                  <span className="font-medium">Version {v.version_number}</span>
                  {i === 0 && <Badge>Current</Badge>}
                  <span className="text-muted-foreground">{formatDate(v.created_at.slice(0, 10))}</span>
                  {v.change_note && <span className="truncate text-muted-foreground">· {v.change_note}</span>}
                </summary>
                <div className="pt-2">
                  <ComponentList components={v.snapshot.components} />
                </div>
              </details>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
