import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Percent, Save } from 'lucide-react';
import { toast } from 'sonner';

const PAY_FREQ = [
  { value: 'weekly', label: 'Weekly (52/yr)' },
  { value: 'biweekly', label: 'Bi-weekly (26/yr)' },
  { value: 'semimonthly', label: 'Semi-monthly (24/yr)' },
  { value: 'monthly', label: 'Monthly (12/yr)' },
];

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

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const patch = {
        social_security_rate: Number(form.social_security_rate),
        social_security_wage_base: Number(form.social_security_wage_base),
        medicare_rate: Number(form.medicare_rate),
        additional_medicare_rate: Number(form.additional_medicare_rate),
        additional_medicare_threshold: Number(form.additional_medicare_threshold),
        suta_rate: Number(form.suta_rate),
        suta_wage_base: Number(form.suta_wage_base),
        pay_frequency: form.pay_frequency,
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5" /> Payroll Taxes (W-2)
        </CardTitle>
        <CardDescription>
          2026 federal + Florida defaults. Update rates and wage bases as the IRS / state publishes changes.
          Federal Income Tax brackets follow IRS Pub 15-T Percentage Method and are seeded with 2026 values.
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

        <section>
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Florida Reemployment Tax (SUTA) — employer only
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xl">
            <div>
              <Label>Rate (0.0027 – 0.054)</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.suta_rate}
                onChange={(e) => update('suta_rate', e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                New employer default: 0.027. Existing employers use their annually assigned rate.
              </p>
            </div>
            <div>
              <Label>Taxable Wage Base ($)</Label>
              <Input
                type="number"
                step="1"
                value={form.suta_wage_base}
                onChange={(e) => update('suta_wage_base', e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">FL default: $7,000 per employee per year.</p>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-2" /> Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
