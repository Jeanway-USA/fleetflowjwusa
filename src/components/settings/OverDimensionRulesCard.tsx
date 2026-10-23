import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatFeetInches } from '@/utils/overDimension';
import { SaveBar } from '@/components/settings/SaveBar';

interface Rule {
  id: string;
  dimension: 'height' | 'width' | 'length';
  min_inches: number;
  max_inches: number | null;
  cents_per_mile: number;
  sort_order: number;
}

type Editable = 'min_inches' | 'max_inches' | 'cents_per_mile';

const DIM_LABEL: Record<Rule['dimension'], string> = {
  height: 'Height',
  width: 'Width',
  length: 'Length',
};

export function OverDimensionRulesCard() {
  const { orgId } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['over_dimension_rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('over_dimension_rules')
        .select('id, dimension, min_inches, max_inches, cents_per_mile, sort_order')
        .order('dimension', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  useEffect(() => {
    setRows(data);
  }, [data]);

  const grouped = useMemo(() => {
    const g: Record<Rule['dimension'], Rule[]> = { height: [], width: [], length: [] };
    rows.forEach((r) => g[r.dimension]?.push(r));
    return g;
  }, [rows]);

  // Only rows that were really changed are saved.
  const changed = useMemo(
    () => rows.filter((r) => {
      const was = data.find((d) => d.id === r.id);
      return !!was && (was.min_inches !== r.min_inches || was.max_inches !== r.max_inches || Number(was.cents_per_mile) !== Number(r.cents_per_mile));
    }),
    [rows, data],
  );

  const update = (id: string, field: Editable, value: number | null) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const results = await Promise.all(
        changed.map((r) =>
          supabase
            .from('over_dimension_rules')
            .update({
              min_inches: Math.max(0, Math.floor(r.min_inches || 0)),
              max_inches: r.max_inches == null ? null : Math.max(0, Math.floor(r.max_inches)),
              cents_per_mile: Math.max(0, Number(r.cents_per_mile) || 0),
            })
            .eq('id', r.id),
        ),
      );
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
      toast.success(`Saved ${changed.length} ${changed.length === 1 ? 'rule' : 'rules'}`);
      await qc.invalidateQueries({ queryKey: ['over_dimension_rules'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save over-dimension rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" />
          Over-dimension (Landstar Rule 670)
        </CardTitle>
        <CardDescription>
          Legal limits are 13'6" high, 8'6" wide and 70'0" long. When a load goes over, the matching cents-per-mile surcharge is added
          automatically as a Company accessorial (not driver pay). Ranges are in inches.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No rules are set up.</p>
        ) : (
          <>
            {(Object.keys(grouped) as Rule['dimension'][]).map((dim) => (
              <section key={dim} aria-label={DIM_LABEL[dim]}>
                <div className="grid grid-cols-[minmax(0,8.5rem)_repeat(3,minmax(0,1fr))] gap-3 border-y border-border bg-muted/40 px-6 py-2 text-[13px] text-muted-foreground max-sm:hidden">
                  <span className="font-semibold text-foreground">{DIM_LABEL[dim]}</span>
                  <span>From (in)</span>
                  <span>Up to (in, blank = no limit)</span>
                  <span>$ per mile</span>
                </div>
                <h4 className="border-y border-border bg-muted/40 px-6 py-2 text-sm font-semibold sm:hidden">{DIM_LABEL[dim]}</h4>
                <ul className="divide-y divide-border">
                  {grouped[dim].map((r) => (
                    <li key={r.id} className="grid gap-x-3 gap-y-2 px-6 py-2 sm:grid-cols-[minmax(0,8.5rem)_repeat(3,minmax(0,1fr))] sm:items-center">
                      <span className="text-[13px] tabular-nums text-muted-foreground max-sm:order-last">
                        {formatFeetInches(r.min_inches)} to {r.max_inches == null ? 'no limit' : formatFeetInches(r.max_inches)}
                      </span>
                      <label className="block">
                        <span className="mb-1 block text-[13px] text-muted-foreground sm:hidden">From (in)</span>
                        <Input type="number" inputMode="numeric" min={0} aria-label={`${DIM_LABEL[dim]} from (inches)`} value={r.min_inches}
                          onChange={(e) => update(r.id, 'min_inches', parseInt(e.target.value || '0', 10))} className="h-10 tabular-nums" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[13px] text-muted-foreground sm:hidden">Up to (in, blank = no limit)</span>
                        <Input type="number" inputMode="numeric" min={0} aria-label={`${DIM_LABEL[dim]} up to (inches)`} value={r.max_inches ?? ''} placeholder="No limit"
                          onChange={(e) => update(r.id, 'max_inches', e.target.value === '' ? null : parseInt(e.target.value, 10))} className="h-10 tabular-nums" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[13px] text-muted-foreground sm:hidden">$ per mile</span>
                        <Input type="number" inputMode="decimal" min={0} step="0.01" aria-label={`${DIM_LABEL[dim]} dollars per mile`} value={r.cents_per_mile}
                          onChange={(e) => update(r.id, 'cents_per_mile', parseFloat(e.target.value || '0'))} className="h-10 tabular-nums" />
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <SaveBar changes={changed.length} saving={saving} onSave={handleSave} onDiscard={() => setRows(data)} noun="rule change" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
