import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatFeetInches } from '@/utils/overDimension';

interface Rule {
  id: string;
  dimension: 'height' | 'width' | 'length';
  min_inches: number;
  max_inches: number | null;
  cents_per_mile: number;
  sort_order: number;
}

const DIM_LABEL: Record<Rule['dimension'], string> = {
  height: 'Height',
  width: 'Width',
  length: 'Length',
};

export function OverDimensionRulesCard() {
  const { orgId, isDemoMode } = useAuth();
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

  const update = (id: string, field: 'min_inches' | 'max_inches' | 'cents_per_mile', value: number | null) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    if (isDemoMode) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        rows.map((r) =>
          supabase
            .from('over_dimension_rules')
            .update({
              min_inches: Math.max(0, Math.floor(r.min_inches || 0)),
              max_inches: r.max_inches == null ? null : Math.max(0, Math.floor(r.max_inches)),
              cents_per_mile: Math.max(0, Number(r.cents_per_mile) || 0),
            })
            .eq('id', r.id)
        )
      );
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
      toast.success('Over-Dimension rules saved');
      qc.invalidateQueries({ queryKey: ['over_dimension_rules'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save Over-Dimension rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" />
          Over-Dimension (Landstar Rule 670)
        </CardTitle>
        <CardDescription>
          Legal limits: <strong>13'6"</strong> H × <strong>8'6"</strong> W × <strong>70'0"</strong> L. When a load exceeds these,
          the matching cents-per-mile surcharge is added automatically as a <em>Company</em> accessorial
          (not driver pay). Ranges are stored in inches.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules configured.</p>
        ) : (
          <>
            {(Object.keys(grouped) as Rule['dimension'][]).map((dim) => (
              <div key={dim} className="space-y-2">
                <h4 className="text-sm font-semibold">{DIM_LABEL[dim]}</h4>
                <div className="hidden sm:grid grid-cols-12 gap-3 text-xs font-medium text-muted-foreground px-1">
                  <div className="col-span-3">Min (in)</div>
                  <div className="col-span-3">Max (in, blank = ∞)</div>
                  <div className="col-span-3">$/mile</div>
                  <div className="col-span-3">Range</div>
                </div>
                {grouped[dim].map((r) => (
                  <div key={r.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3 rounded-lg bg-muted/40">
                    <div className="sm:col-span-3 space-y-1">
                      <Label className="sm:hidden text-xs">Min (in)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={r.min_inches}
                        onChange={(e) => update(r.id, 'min_inches', parseInt(e.target.value || '0', 10))}
                        className="pl-4 sm:pl-3 h-10"
                      />
                    </div>
                    <div className="sm:col-span-3 space-y-1">
                      <Label className="sm:hidden text-xs">Max (in)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={r.max_inches ?? ''}
                        onChange={(e) =>
                          update(r.id, 'max_inches', e.target.value === '' ? null : parseInt(e.target.value, 10))
                        }
                        placeholder="∞"
                        className="pl-4 sm:pl-3 h-10"
                      />
                    </div>
                    <div className="sm:col-span-3 space-y-1">
                      <Label className="sm:hidden text-xs">$/mile</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.cents_per_mile}
                        onChange={(e) => update(r.id, 'cents_per_mile', parseFloat(e.target.value || '0'))}
                        className="pl-4 sm:pl-3 h-10"
                      />
                    </div>
                    <div className="sm:col-span-3 text-xs text-muted-foreground pt-2">
                      {formatFeetInches(r.min_inches)} – {r.max_inches == null ? '∞' : formatFeetInches(r.max_inches)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <Button
              onClick={handleSave}
              disabled={saving || isDemoMode}
              className="gradient-gold text-primary-foreground"
            >
              {saving ? 'Saving…' : 'Save Over-Dimension Rules'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
