import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Plus, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

type TierRow = {
  id?: string;
  min_miles: string;
  max_miles: string; // blank = infinite
  rate_per_mile: string;
  _isNew?: boolean;
  _toDelete?: boolean;
};

type GlobalRules = {
  max_bonus_amount: string;
  period_length_days: string;
  requires_zero_accidents: boolean;
  requires_zero_csa_points: boolean;
  requires_zero_service_failures: boolean;
};

const DEFAULT_RULES: GlobalRules = {
  max_bonus_amount: '500.00',
  period_length_days: '28',
  requires_zero_accidents: true,
  requires_zero_csa_points: true,
  requires_zero_service_failures: true,
};

export function SafetyBonusSettings() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['safety-bonus-config', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: settings, error: sErr } = await supabase
        .from('safety_bonus_settings')
        .select('*')
        .eq('org_id', orgId!)
        .maybeSingle();
      if (sErr) throw sErr;

      let tiers: any[] = [];
      if (settings) {
        const { data: t, error: tErr } = await supabase
          .from('safety_bonus_tiers')
          .select('*')
          .eq('setting_id', settings.id)
          .order('min_miles', { ascending: true });
        if (tErr) throw tErr;
        tiers = t ?? [];
      }
      return { settings, tiers };
    },
  });

  const [rules, setRules] = useState<GlobalRules>(DEFAULT_RULES);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [settingId, setSettingId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSettingId(data.settings?.id ?? null);
    setRules(
      data.settings
        ? {
            max_bonus_amount: String(data.settings.max_bonus_amount ?? '500'),
            period_length_days: String(data.settings.period_length_days ?? '28'),
            requires_zero_accidents: !!data.settings.requires_zero_accidents,
            requires_zero_csa_points: !!data.settings.requires_zero_csa_points,
            requires_zero_service_failures: !!data.settings.requires_zero_service_failures,
          }
        : DEFAULT_RULES,
    );
    setTiers(
      (data.tiers ?? []).map((t: any) => ({
        id: t.id,
        min_miles: String(t.min_miles ?? ''),
        max_miles: t.max_miles == null ? '' : String(t.max_miles),
        rate_per_mile: String(t.rate_per_mile ?? ''),
      })),
    );
  }, [data]);

  const addTier = () => {
    const lastMax = tiers
      .filter((t) => !t._toDelete)
      .map((t) => Number(t.max_miles))
      .filter((n) => !Number.isNaN(n) && n > 0)
      .pop();
    setTiers((prev) => [
      ...prev,
      {
        min_miles: lastMax ? String(lastMax) : '',
        max_miles: '',
        rate_per_mile: '',
        _isNew: true,
      },
    ]);
  };

  const updateTier = (idx: number, patch: Partial<TierRow>) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeTier = (idx: number) => {
    setTiers((prev) => {
      const next = [...prev];
      const t = next[idx];
      if (t._isNew) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...t, _toDelete: true };
      }
      return next;
    });
  };

  const undoRemove = (idx: number) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, _toDelete: false } : t)));
  };

  const tierErrors = useMemo(() => {
    return tiers.map((t) => {
      if (t._toDelete) return null;
      const min = Number(t.min_miles);
      const max = t.max_miles === '' ? null : Number(t.max_miles);
      const rate = Number(t.rate_per_mile);
      if (t.min_miles === '' || Number.isNaN(min) || min < 0) return 'Min miles required';
      if (max != null && (Number.isNaN(max) || max <= min)) return 'Max must be greater than min';
      if (t.rate_per_mile === '' || Number.isNaN(rate) || rate < 0) return 'Rate required';
      return null;
    });
  }, [tiers]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization');

      const maxBonus = Number(rules.max_bonus_amount);
      const periodDays = Number(rules.period_length_days);
      if (Number.isNaN(maxBonus) || maxBonus < 0) throw new Error('Max bonus must be ≥ 0');
      if (Number.isNaN(periodDays) || periodDays < 1) throw new Error('Period length must be ≥ 1');
      if (tierErrors.some((e) => e)) throw new Error('Fix tier errors before saving');

      // 1) Upsert settings
      let currentSettingId = settingId;
      const settingsPayload = {
        org_id: orgId,
        max_bonus_amount: maxBonus,
        period_length_days: periodDays,
        requires_zero_accidents: rules.requires_zero_accidents,
        requires_zero_csa_points: rules.requires_zero_csa_points,
        requires_zero_service_failures: rules.requires_zero_service_failures,
      };

      if (currentSettingId) {
        const { error } = await supabase
          .from('safety_bonus_settings')
          .update(settingsPayload)
          .eq('id', currentSettingId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('safety_bonus_settings')
          .insert(settingsPayload)
          .select('id')
          .single();
        if (error) throw error;
        currentSettingId = inserted.id;
      }

      // 2) Reconcile tiers
      const ops: Promise<any>[] = [];
      for (const t of tiers) {
        const payload = {
          setting_id: currentSettingId!,
          org_id: orgId,
          min_miles: Number(t.min_miles),
          max_miles: t.max_miles === '' ? null : Number(t.max_miles),
          rate_per_mile: Number(t.rate_per_mile),
        };

        if (t.id && t._toDelete) {
          ops.push(supabase.from('safety_bonus_tiers').delete().eq('id', t.id));
        } else if (t._isNew && !t._toDelete) {
          ops.push(supabase.from('safety_bonus_tiers').insert(payload));
        } else if (t.id && !t._toDelete) {
          ops.push(supabase.from('safety_bonus_tiers').update(payload).eq('id', t.id));
        }
      }
      const results = await Promise.all(ops);
      for (const r of results) {
        if ((r as any)?.error) throw (r as any).error;
      }
    },
    onSuccess: () => {
      toast.success('Safety bonus settings saved');
      queryClient.invalidateQueries({ queryKey: ['safety-bonus-config', orgId] });
      queryClient.invalidateQueries({ queryKey: ['safety-bonus'] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to save'),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Safety &amp; Performance Bonus Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const visibleTiers = tiers;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Safety &amp; Performance Bonus Configuration
            </CardTitle>
            <CardDescription>
              Reward drivers for safe, on-time driving with a tiered per-mile bonus.
            </CardDescription>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-gradient-to-r from-amber-500 to-yellow-600 text-white hover:opacity-90"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Global Rules */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Global Rules</h3>
            <p className="text-xs text-muted-foreground">
              Limits and disqualifiers applied to every driver.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max-bonus">Max Bonus Amount ($)</Label>
              <Input
                id="max-bonus"
                type="number"
                step="0.01"
                min="0"
                value={rules.max_bonus_amount}
                onChange={(e) =>
                  setRules((r) => ({ ...r, max_bonus_amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-days">Period Length (Days)</Label>
              <Input
                id="period-days"
                type="number"
                step="1"
                min="1"
                value={rules.period_length_days}
                onChange={(e) =>
                  setRules((r) => ({ ...r, period_length_days: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            {([
              ['requires_zero_accidents', 'Zero Accidents Required', 'Disqualify drivers with any reported accident in the period.'],
              ['requires_zero_csa_points', 'Zero CSA Citations Required', 'Disqualify drivers with any CSA citation in the period.'],
              ['requires_zero_service_failures', 'Zero Service Failures Required', 'Disqualify drivers with any late or failed delivery in the period.'],
            ] as const).map(([key, label, desc]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
              >
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={rules[key]}
                  onCheckedChange={(v) => setRules((r) => ({ ...r, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Mileage Tiers */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Mileage Tiers</h3>
              <p className="text-xs text-muted-foreground">
                Drivers earn the rate from the tier matching their period miles. Leave Max Miles blank for the top tier.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addTier}>
              <Plus className="h-4 w-4 mr-1" />
              Add Tier
            </Button>
          </div>

          {visibleTiers.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">No tiers configured yet.</p>
              <Button type="button" variant="outline" size="sm" onClick={addTier}>
                <Plus className="h-4 w-4 mr-1" />
                Add your first tier
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleTiers.map((tier, idx) => {
                const err = tierErrors[idx];
                return (
                  <div
                    key={tier.id ?? `new-${idx}`}
                    className={`rounded-md border border-border p-3 space-y-2 ${
                      tier._toDelete ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Min Miles</Label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={tier.min_miles}
                          disabled={tier._toDelete}
                          onChange={(e) => updateTier(idx, { min_miles: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Miles</Label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="blank = ∞"
                          value={tier.max_miles}
                          disabled={tier._toDelete}
                          onChange={(e) => updateTier(idx, { max_miles: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rate Per Mile ($)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={tier.rate_per_mile}
                          disabled={tier._toDelete}
                          onChange={(e) => updateTier(idx, { rate_per_mile: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {tier._toDelete ? (
                          <>
                            <Badge variant="outline" className="text-xs">
                              Will be removed
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => undoRemove(idx)}
                              aria-label="Undo remove"
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTier(idx)}
                            aria-label="Remove tier"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {err && !tier._toDelete && (
                      <p className="text-xs text-destructive">{err}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export default SafetyBonusSettings;
