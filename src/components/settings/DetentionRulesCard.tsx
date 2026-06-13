import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface DetentionRule {
  id: string;
  trailer_type: string;
  free_time_minutes: number;
  hourly_rate: number;
}

export function DetentionRulesCard() {
  const { orgId, isDemoMode } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = useState<DetentionRule[]>([]);
  const [saving, setSaving] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['detention_rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('detention_rules')
        .select('id, trailer_type, free_time_minutes, hourly_rate')
        .order('trailer_type', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DetentionRule[];
    },
  });

  useEffect(() => {
    setRows(data);
  }, [data]);

  const update = (idx: number, field: keyof DetentionRule, value: number) => {
    const next = [...rows];
    next[idx] = { ...next[idx], [field]: value };
    setRows(next);
  };

  const handleSave = async () => {
    if (isDemoMode) return;
    setSaving(true);
    try {
      const updates = rows.map((r) =>
        supabase
          .from('detention_rules')
          .update({
            free_time_minutes: Math.max(0, Math.floor(r.free_time_minutes || 0)),
            hourly_rate: Math.max(0, Number(r.hourly_rate) || 0),
          })
          .eq('id', r.id)
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
      toast.success('Detention rules saved');
      qc.invalidateQueries({ queryKey: ['detention_rules'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save detention rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Detention &amp; Free Time
        </CardTitle>
        <CardDescription>
          Per-trailer-type free time (minutes) and hourly rate ($/hr). The clock starts when a load
          status changes to <strong>At Pickup</strong>, <strong>At Delivery</strong>, <strong>Loading</strong>,
          or <strong>Unloading</strong>. Once free time elapses, dispatcher receives an alert.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No detention rules configured.</p>
        ) : (
          <div className="space-y-3">
            <div className="hidden sm:grid grid-cols-12 gap-3 text-xs font-medium text-muted-foreground px-1">
              <div className="col-span-4">Trailer Type</div>
              <div className="col-span-4">Free Time (minutes)</div>
              <div className="col-span-4">Hourly Rate ($)</div>
            </div>
            {rows.map((r, idx) => (
              <div key={r.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3 rounded-lg bg-muted/40">
                <div className="sm:col-span-4">
                  <Label className="sm:hidden text-xs">Trailer Type</Label>
                  <div className="font-medium pt-1">{r.trailer_type}</div>
                </div>
                <div className="sm:col-span-4 space-y-1">
                  <Label className="sm:hidden text-xs">Free Time (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={r.free_time_minutes}
                    onChange={(e) => update(idx, 'free_time_minutes', parseInt(e.target.value || '0', 10))}
                    className="pl-4 sm:pl-3 h-12"
                  />
                </div>
                <div className="sm:col-span-4 space-y-1">
                  <Label className="sm:hidden text-xs">Hourly Rate ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={r.hourly_rate}
                    onChange={(e) => update(idx, 'hourly_rate', parseFloat(e.target.value || '0'))}
                    className="pl-4 sm:pl-3 h-12"
                  />
                </div>
              </div>
            ))}
            <Button
              onClick={handleSave}
              disabled={saving || isDemoMode}
              className="gradient-gold text-primary-foreground"
            >
              {saving ? 'Saving…' : 'Save Detention Rules'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
