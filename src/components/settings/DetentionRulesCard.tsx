import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SaveBar } from '@/components/settings/SaveBar';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface DetentionRule {
  id: string;
  trailer_type: string;
  free_time_minutes: number;
  hourly_rate: number;
  max_charge_per_day: number;
}

type Field = 'free_time_minutes' | 'hourly_rate' | 'max_charge_per_day';

const FIELDS: Array<{ key: Field; label: string; step?: string; whole?: boolean }> = [
  { key: 'free_time_minutes', label: 'Free time (min)', whole: true },
  { key: 'hourly_rate', label: '$ per hour', step: '0.01' },
  { key: 'max_charge_per_day', label: 'Cap per 24h ($, 0 = none)', step: '0.01' },
];

export function DetentionRulesCard() {
  const { orgId } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = useState<DetentionRule[]>([]);
  const [saving, setSaving] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['detention_rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('detention_rules')
        .select('id, trailer_type, free_time_minutes, hourly_rate, max_charge_per_day')
        .order('trailer_type', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DetentionRule[];
    },
  });

  useEffect(() => {
    setRows(data);
  }, [data]);

  // Only the rows that were actually changed are saved, and the button says how many.
  const changed = useMemo(
    () => rows.filter((r) => {
      const was = data.find((d) => d.id === r.id);
      return !!was && FIELDS.some((f) => Number(was[f.key]) !== Number(r[f.key]));
    }),
    [rows, data],
  );

  const update = (id: string, field: Field, raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: Number.isFinite(value) ? value : 0 } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const results = await Promise.all(
        changed.map((r) =>
          supabase
            .from('detention_rules')
            .update({
              free_time_minutes: Math.max(0, Math.floor(r.free_time_minutes || 0)),
              hourly_rate: Math.max(0, Number(r.hourly_rate) || 0),
              max_charge_per_day: Math.max(0, Number(r.max_charge_per_day) || 0),
            })
            .eq('id', r.id),
        ),
      );
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
      toast.success(`Saved ${changed.length} ${changed.length === 1 ? 'trailer type' : 'trailer types'}`);
      await qc.invalidateQueries({ queryKey: ['detention_rules'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save detention rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Detention and free time
        </CardTitle>
        <CardDescription>
          Free time and the hourly rate for each trailer type. The clock starts when a load reaches At Pickup, At Delivery, Loading or Unloading,
          and dispatch is alerted once free time runs out.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No detention rules are set up.</p>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-3 border-y border-border bg-muted/40 px-6 py-2 text-[13px] text-muted-foreground sm:grid">
              <span>Trailer type</span>
              {FIELDS.map((f) => <span key={f.key}>{f.label}</span>)}
            </div>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="grid gap-x-3 gap-y-2 px-6 py-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center">
                  <span className="font-medium">{r.trailer_type}</span>
                  {FIELDS.map((f) => (
                    <label key={f.key} className="block">
                      <span className="mb-1 block text-[13px] text-muted-foreground sm:hidden">{f.label}</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={f.step}
                        aria-label={`${r.trailer_type}: ${f.label}`}
                        value={r[f.key]}
                        onChange={(e) => update(r.id, f.key, e.target.value)}
                        className="h-10 tabular-nums"
                      />
                    </label>
                  ))}
                </li>
              ))}
            </ul>
            <SaveBar changes={changed.length} saving={saving} onSave={handleSave} onDiscard={() => setRows(data)} noun="trailer type" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
