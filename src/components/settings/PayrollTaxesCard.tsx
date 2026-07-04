import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Percent, Save, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { US_STATES } from '@/lib/us-states';

const PAY_FREQ = [
  { value: 'weekly', label: 'Weekly (52/yr)' },
  { value: 'biweekly', label: 'Bi-weekly (26/yr)' },
  { value: 'semimonthly', label: 'Semi-monthly (24/yr)' },
  { value: 'monthly', label: 'Monthly (12/yr)' },
];

interface StateConfig {
  id?: string;
  state_code: string;
  suta_rate: number | string;
  suta_wage_base: number | string;
  has_state_income_tax: boolean;
  sit_rate: number | string;
}

export function PayrollTaxesCard() {
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['payroll_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payroll_settings').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stateConfigs, isLoading: loadingStates } = useQuery({
    queryKey: ['state_tax_configurations'],
    queryFn: async () => {
      // Ensure the org has the full state list
      await supabase.rpc('seed_state_tax_configurations' as any, {
        _org_id: (settings as any)?.org_id,
      });
      const { data, error } = await supabase
        .from('state_tax_configurations' as any)
        .select('*')
        .order('state_code');
      if (error) throw error;
      return (data ?? []) as unknown as StateConfig[];
    },
    enabled: !!settings,
  });

  const [form, setForm] = useState<any>(null);
  const [stateRows, setStateRows] = useState<StateConfig[]>([]);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (stateConfigs) setStateRows(stateConfigs);
  }, [stateConfigs]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const patch = {
        social_security_rate: Number(form.social_security_rate),
        social_security_wage_base: Number(form.social_security_wage_base),
        medicare_rate: Number(form.medicare_rate),
        additional_medicare_rate: Number(form.additional_medicare_rate),
        additional_medicare_threshold: Number(form.additional_medicare_threshold),
        pay_frequency: form.pay_frequency,
        default_tax_state: form.default_tax_state || 'FL',
      };
      const { error } = await supabase.from('payroll_settings').update(patch).eq('id', form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Payroll tax settings saved');
      qc.invalidateQueries({ queryKey: ['payroll_settings'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to save'),
  });

  const saveStates = useMutation({
    mutationFn: async () => {
      const rows = stateRows.map((r) => ({
        id: r.id,
        state_code: r.state_code,
        suta_rate: Number(r.suta_rate) || 0,
        suta_wage_base: Number(r.suta_wage_base) || 0,
        has_state_income_tax: !!r.has_state_income_tax,
        sit_rate: Number(r.sit_rate) || 0,
      }));
      // Update in a loop (org_id set by RLS; row already exists via seeder)
      for (const r of rows) {
        if (!r.id) continue;
        const { error } = await supabase
          .from('state_tax_configurations' as any)
          .update({
            suta_rate: r.suta_rate,
            suta_wage_base: r.suta_wage_base,
            has_state_income_tax: r.has_state_income_tax,
            sit_rate: r.sit_rate,
          })
          .eq('id', r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('State tax rates saved');
      qc.invalidateQueries({ queryKey: ['state_tax_configurations'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to save state rates'),
  });

  const updateStateRow = (idx: number, patch: Partial<StateConfig>) => {
    setStateRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const resetStateRow = (idx: number) => {
    const r = stateRows[idx];
    if (!r) return;
    let patch: Partial<StateConfig>;
    if (r.state_code === 'FL') {
      patch = { suta_rate: 0.027, suta_wage_base: 7000, has_state_income_tax: false, sit_rate: 0 };
    } else if (r.state_code === 'TX') {
      patch = { suta_rate: 0, suta_wage_base: 9000, has_state_income_tax: false, sit_rate: 0 };
    } else {
      patch = { suta_rate: 0, suta_wage_base: 0, has_state_income_tax: false, sit_rate: 0 };
    }
    updateStateRow(idx, patch);
  };

  if (isLoading || !form) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payroll Taxes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" /> Payroll Taxes (Federal)
          </CardTitle>
          <CardDescription>
            2026 federal defaults. Update rates and wage bases as the IRS publishes changes.
            State SUTA and state income tax are managed per-state below and applied by each driver's
            assigned Tax State.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <section>
            <div className="text-xs uppercase text-muted-foreground mb-2">Pay Frequency</div>
            <Select value={form.pay_frequency} onValueChange={(v) => update('pay_frequency', v)}>
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAY_FREQ.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-2">
              Default Tax State (used when a driver has no Tax State set)
            </div>
            <Select
              value={form.default_tax_state || 'FL'}
              onValueChange={(v) => update('default_tax_state', v)}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-2">FICA — Social Security</div>
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              <div>
                <Label>Rate (employee & employer each)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.social_security_rate}
                  onChange={(e) => update('social_security_rate', e.target.value)}
                />
              </div>
              <div>
                <Label>Wage Base ($)</Label>
                <Input
                  type="number"
                  step="1"
                  value={form.social_security_wage_base}
                  onChange={(e) => update('social_security_wage_base', e.target.value)}
                />
              </div>
            </div>
          </section>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-2">FICA — Medicare</div>
            <div className="grid grid-cols-3 gap-3 max-w-3xl">
              <div>
                <Label>Rate</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.medicare_rate}
                  onChange={(e) => update('medicare_rate', e.target.value)}
                />
              </div>
              <div>
                <Label>Additional Rate (employee only)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.additional_medicare_rate}
                  onChange={(e) => update('additional_medicare_rate', e.target.value)}
                />
              </div>
              <div>
                <Label>Additional Threshold ($)</Label>
                <Input
                  type="number"
                  step="1"
                  value={form.additional_medicare_threshold}
                  onChange={(e) => update('additional_medicare_threshold', e.target.value)}
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-2" /> Save federal settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> State Tax Configurations
          </CardTitle>
          <CardDescription>
            SUTA rate / wage base and optional flat State Income Tax per state. When a W-2 driver is
            paid, the engine looks up their Tax State and applies the values below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStates ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 w-16">State</th>
                      <th className="text-right px-3 py-2 w-32">SUTA Rate</th>
                      <th className="text-right px-3 py-2 w-40">SUTA Wage Base ($)</th>
                      <th className="text-center px-3 py-2 w-24">Has SIT</th>
                      <th className="text-right px-3 py-2 w-32">SIT Rate</th>
                      <th className="text-right px-3 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateRows.map((r, idx) => (
                      <tr key={r.state_code} className="border-t">
                        <td className="px-3 py-1 font-medium">{r.state_code}</td>
                        <td className="px-3 py-1">
                          <Input
                            type="number"
                            step="0.0001"
                            value={r.suta_rate}
                            onChange={(e) => updateStateRow(idx, { suta_rate: e.target.value })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <Input
                            type="number"
                            step="1"
                            value={r.suta_wage_base}
                            onChange={(e) => updateStateRow(idx, { suta_wage_base: e.target.value })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-1 text-center">
                          <Switch
                            checked={!!r.has_state_income_tax}
                            onCheckedChange={(v) => updateStateRow(idx, { has_state_income_tax: v })}
                          />
                        </td>
                        <td className="px-3 py-1">
                          <Input
                            type="number"
                            step="0.0001"
                            value={r.sit_rate}
                            disabled={!r.has_state_income_tax}
                            onChange={(e) => updateStateRow(idx, { sit_rate: e.target.value })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-1 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => resetStateRow(idx)}
                          >
                            Reset
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={() => saveStates.mutate()} disabled={saveStates.isPending}>
                  <Save className="h-4 w-4 mr-2" /> Save state changes
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
