import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useTaxYearConfig } from '@/hooks/useTaxYearConfig';
import { CURRENT_TAX_YEAR } from '@/lib/payroll/taxTables';
import { notify } from '@/lib/notify';

const RATE_FIELDS: { key: string; label: string; suffix: '%' | '$'; help?: string }[] = [
  { key: 'social_security_rate', label: 'Social Security rate (employee & employer each)', suffix: '%' },
  { key: 'social_security_wage_base', label: 'Social Security wage base', suffix: '$' },
  { key: 'medicare_rate', label: 'Medicare rate (each side)', suffix: '%' },
  { key: 'additional_medicare_rate', label: 'Additional Medicare rate (employee only)', suffix: '%' },
  { key: 'additional_medicare_threshold', label: 'Additional Medicare threshold', suffix: '$' },
  { key: 'futa_rate', label: 'FUTA rate (after credit)', suffix: '%' },
  { key: 'futa_wage_base', label: 'FUTA wage base', suffix: '$' },
  { key: 'dependent_credit_qualifying_child', label: 'Credit per qualifying child', suffix: '$' },
  { key: 'dependent_credit_other', label: 'Credit per other dependent', suffix: '$' },
];

/**
 * Editable tax-year configuration. Nothing in the engine is hardcoded — when
 * the IRS or a state publishes new numbers, they are updated here.
 */
export function TaxSettingsTab({ taxYear = CURRENT_TAX_YEAR }: { taxYear?: number }) {
  const qc = useQueryClient();
  const { data: ctx, isLoading } = useTaxYearConfig(taxYear);
  const [draft, setDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!ctx) return;
    const c = ctx.config as unknown as Record<string, unknown>;
    const next: Record<string, number> = {};
    for (const f of RATE_FIELDS) next[f.key] = Number(c[f.key]) || 0;
    setDraft(next);
  }, [ctx]);

  const dirty = useMemo(() => {
    if (!ctx) return false;
    const c = ctx.config as unknown as Record<string, unknown>;
    return RATE_FIELDS.some((f) => Number(c[f.key]) !== Number(draft[f.key]));
  }, [ctx, draft]);

  const save = useMutation({
    mutationFn: async () => {
      if (!ctx?.configId) throw new Error('Tax configuration row not found for this year.');
      const { error } = await supabase
        .from('tax_year_configs')
        .update(draft as never)
        .eq('id', ctx.configId);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success('Tax rates updated', 'New pay runs will use these values.');
      qc.invalidateQueries({ queryKey: ['tax_year_config'] });
    },
    onError: (e: any) => notify.error('Could not save tax rates', e.message),
  });

  const states = useMemo(
    () => Array.from(ctx?.statesByCode.values() ?? []).sort((a, b) => a.state_code.localeCompare(b.state_code)),
    [ctx],
  );

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Federal rates
              <Badge variant="secondary">{taxYear}</Badge>
              {ctx?.config.is_locked && <Badge variant="outline">Locked</Badge>}
            </CardTitle>
            <CardDescription>
              Used by every W-2 calculation. Federal income tax uses the IRS Publication 15-T
              percentage-method tables stored for this year.
            </CardDescription>
          </div>
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RATE_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key} className="text-xs">
                {f.label}
              </Label>
              <div className="relative">
                <Input
                  id={f.key}
                  type="number"
                  step={f.suffix === '%' ? '0.0001' : '1'}
                  className="pl-4 pr-10 sm:pl-3"
                  value={draft[f.key] ?? 0}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.key]: parseFloat(e.target.value) || 0 }))
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {f.suffix === '%' ? 'rate' : 'USD'}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>State rates</CardTitle>
          <CardDescription>
            SUTA and state income tax rates applied by the payroll engine per work state.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead className="text-right">SUTA rate</TableHead>
                <TableHead className="text-right">SUTA wage base</TableHead>
                <TableHead className="text-right">State income tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {states.map((s) => (
                <TableRow key={s.state_code}>
                  <TableCell className="font-medium">{s.state_code}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(s.suta_rate * 100).toFixed(3)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${s.suta_wage_base.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.has_state_income_tax ? `${(s.sit_rate * 100).toFixed(2)}%` : 'None'}
                  </TableCell>
                </TableRow>
              ))}
              {states.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No state configurations yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
