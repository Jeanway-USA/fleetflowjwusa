import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CurrencyInput, PercentageInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { calculateRevenue, type RevenueSettings } from '@/lib/revenue-calculator';
import { planRecalculation, type RecalcPlan } from '@/lib/recalculate-loads';
import { formatCurrency } from '@/lib/formatters';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { useAuth } from '@/contexts/AuthContext';

interface CompensationSettingsTabProps {
  getSetting: (key: string, defaultValue?: string) => string;
}

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));

/** An example load, so the rates can be read as dollars. */
const EXAMPLE = { linehaul: 3000, fuelSurcharge: 500 };

function toSettings(values: { truck: string; trailer: string; powerOnly: string; advance: string; ownsTrailer: string }): RevenueSettings {
  return {
    truckPct: (parseFloat(values.truck) || 0) / 100,
    trailerPct: (parseFloat(values.trailer) || 0) / 100,
    advancePct: (parseFloat(values.advance) || 0) / 100,
    ownsTrailer: values.ownsTrailer === 'true',
    powerOnlyPct: (parseFloat(values.powerOnly) || 0) / 100,
  };
}

export function CompensationSettingsTab({ getSetting }: CompensationSettingsTabProps) {
  const queryClient = useQueryClient();
  const { orgId } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<RecalcPlan | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: updated, error } = await supabase
        .from('company_settings')
        .update({ setting_value: value })
        .eq('setting_key', key)
        .select('setting_key');
      if (error) throw error;
      // Settings that were never seeded (e.g. operational_cpm) have no row to update.
      if (!updated || updated.length === 0) {
        if (!orgId) throw new Error('No organization context, reload and try again');
        const { error: insertError } = await supabase
          .from('company_settings')
          .insert({ setting_key: key, setting_value: value, org_id: orgId } as any);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] });
      queryClient.invalidateQueries({ queryKey: ['operational-cpm'] });
      toast.success('Settings updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const current = {
    truck: getSetting('truck_percentage', '65'),
    trailer: getSetting('trailer_percentage', '7'),
    powerOnly: getSetting('power_only_percentage', '70'),
    advance: getSetting('advance_percentage', '30'),
    ownsTrailer: getSetting('owns_trailer', 'false'),
    cpm: getSetting('operational_cpm', '1.75'),
  };
  const shown = editing
    ? {
        truck: String(form.truck_percentage ?? ''),
        trailer: String(form.trailer_percentage ?? ''),
        powerOnly: String(form.power_only_percentage ?? ''),
        advance: String(form.advance_percentage ?? ''),
        ownsTrailer: String(form.owns_trailer ?? 'false'),
        cpm: String(form.operational_cpm ?? ''),
      }
    : current;

  const example = useMemo(
    () =>
      calculateRevenue(
        { rate: EXAMPLE.linehaul, fuel_surcharge: EXAMPLE.fuelSurcharge, lumper: 0, advance_taken: 0, is_power_only: false, accessorialsTotal: 0 },
        toSettings(shown),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown.truck, shown.trailer, shown.powerOnly, shown.advance, shown.ownsTrailer],
  );
  const owns = shown.ownsTrailer === 'true';

  const startEdit = () => {
    setForm({
      truck_percentage: current.truck,
      trailer_percentage: current.trailer,
      power_only_percentage: current.powerOnly,
      advance_percentage: current.advance,
      owns_trailer: current.ownsTrailer,
      operational_cpm: current.cpm,
    });
    setEditing(true);
  };

  const handleSave = () => {
    // Trailer % is added on top of truck % (e.g. 65 + 7 = 72 for a BCO pulling their own trailer),
    // so the combined share can never exceed 100%.
    const combined = parseFloat(form.truck_percentage) + (form.owns_trailer === 'true' ? parseFloat(form.trailer_percentage) : 0);
    if (combined > 100) {
      toast.error(`Truck plus trailer share is ${combined}% of linehaul. Trailer % is added on top of truck %: for 72% total, enter 7.`);
      return;
    }
    Object.entries(form).forEach(([key, value]) => {
      if (value !== getSetting(key)) {
        updateMutation.mutate({ key, value: String(value) });
      }
    });
    setEditing(false);
    // Saved rates change what a recalculation would do, so any earlier check is stale.
    setPlan(null);
  };

  /** Compare every stored load with what today's rates produce, without writing anything. */
  const handleCheck = async () => {
    setChecking(true);
    setPlan(null);
    try {
      const [{ data: loads, error: loadsError }, { data: accessorials, error: accError }] = await Promise.all([
        supabase.from('fleet_loads').select('*').is('deleted_at', null),
        supabase.from('load_accessorials').select('load_id, amount, percentage').is('deleted_at', null),
      ]);
      if (loadsError) throw loadsError;
      if (accError) throw accError;
      setPlan(planRecalculation((loads ?? []) as any[], (accessorials ?? []) as any[], toSettings(current)));
    } catch (err: any) {
      toast.error(`Could not check the loads: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    if (!plan || plan.changes.length === 0) return;
    setApplying(true);
    try {
      let updated = 0;
      for (const change of plan.changes) {
        const { error } = await supabase.from('fleet_loads').update(change.patch).eq('id', change.id);
        if (!error) updated++;
      }
      toast.success(`Updated ${updated} of ${plan.changes.length} loads`);
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      setPlan(null);
    } catch (err: any) {
      toast.error(`Recalculation failed: ${err.message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel
        title="How Landstar pays you"
        description="These rates decide what you earn on every load and how much Landstar will advance."
        aside={
          !editing && (
            <Button variant="outline" className="h-11" onClick={startEdit}>Edit rates</Button>
          )
        }
      >
        {editing ? (
          <div className="space-y-4 pb-2 pt-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Your share of linehaul (%)</Label>
                <PercentageInput value={form.truck_percentage ?? ''} onChange={(v) => setForm({ ...form, truck_percentage: v })} />
              </div>
              <div className="space-y-2">
                <Label>Power-only share (%)</Label>
                <PercentageInput value={form.power_only_percentage ?? ''} onChange={(v) => setForm({ ...form, power_only_percentage: v })} />
              </div>
              <div className="space-y-2">
                <Label>Do you own the trailer?</Label>
                <Select value={form.owns_trailer || 'false'} onValueChange={(v) => setForm({ ...form, owns_trailer: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trailer share, added on top (%)</Label>
                <PercentageInput value={form.trailer_percentage ?? ''} onChange={(v) => setForm({ ...form, trailer_percentage: v })} />
              </div>
              <div className="space-y-2">
                <Label>Advance rate (%)</Label>
                <PercentageInput value={form.advance_percentage ?? ''} onChange={(v) => setForm({ ...form, advance_percentage: v })} />
              </div>
              <div className="space-y-2">
                <Label>Operating cost per mile</Label>
                <CurrencyInput value={form.operational_cpm ?? ''} onChange={(v) => setForm({ ...form, operational_cpm: v })} />
                <p className="text-[13px] text-muted-foreground">Fuel, insurance, maintenance and truck payment, all in. It drives the estimated profit and break-even figures.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <StatementLine label="Your share of linehaul" note="The truck's share. Fuel surcharge comes to you at 100%." value={`${current.truck}%`} />
            <StatementLine
              label="Trailer share, added on top"
              note={owns ? 'Added to your share when you pull your own trailer.' : 'You do not own the trailer, so nothing is added.'}
              value={owns ? `${current.trailer}%` : 'Not used'}
              muted={!owns}
            />
            <StatementLine label="Power-only share" note="Your share of linehaul on power-only loads." value={`${current.powerOnly}%`} />
            <StatementLine label="Advance rate" note="The share of linehaul Landstar advances against a trip, plus its fuel surcharge." value={`${current.advance}%`} />
            <StatementLine label="Operating cost per mile" note="All in. Drives the estimated profit and break-even figures." value={`$${Number(current.cpm).toFixed(2)}`} rule="single" />
          </>
        )}

        <div className="border-t py-3">
          <p className="text-[13px] font-semibold text-muted-foreground">
            Example: a {formatCurrency(EXAMPLE.linehaul)} load with a {formatCurrency(EXAMPLE.fuelSurcharge)} fuel surcharge
          </p>
          <p className="mt-1 text-[15px] tabular-nums">
            You earn <span className="font-semibold">{money(example.net_revenue)}</span>
            : {money(example.truck_revenue - EXAMPLE.fuelSurcharge)} from your share of linehaul{example.trailer_revenue > 0 ? `, ${money(example.trailer_revenue)} for the trailer` : ''}, plus the {formatCurrency(EXAMPLE.fuelSurcharge)} fuel surcharge.
            Landstar can advance up to <span className="font-semibold">{money(example.advance_available)}</span>.
          </p>
        </div>

        {editing && (
          <div className="flex flex-wrap gap-2 border-t py-3">
            <Button className="h-11" onClick={handleSave}>Save rates</Button>
            <Button variant="outline" className="h-11" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        )}
      </Panel>

      <Panel
        title="Recalculate loads"
        description="After you change a rate, update the revenue stored on your existing loads. Check first to see exactly what would change."
        aside={
          <Button variant="outline" className="h-11 gap-2" onClick={handleCheck} disabled={checking || applying}>
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking' : 'Check loads'}
          </Button>
        }
      >
        {plan === null ? (
          <p className="pb-3 text-sm text-muted-foreground">Nothing is changed until you check and then apply.</p>
        ) : plan.changes.length === 0 ? (
          <p role="status" className="pb-3 text-[15px]">
            All {plan.total} loads already match your current rates. There is nothing to update.
          </p>
        ) : (
          <div role="status">
            <StatementLine label="Loads checked" value={plan.total.toLocaleString()} muted />
            <StatementLine label="Loads that would change" value={plan.changes.length.toLocaleString()} />
            <StatementLine
              label="Your revenue on them"
              note={plan.revenueChange >= 0 ? 'Would go up' : 'Would go down'}
              value={`${plan.revenueChange >= 0 ? '+' : '−'}${formatCurrency(Math.abs(plan.revenueChange))}`}
              strong
              rule="double"
            />
            <ul className="divide-y border-t text-[14px]">
              {plan.changes.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-baseline gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{c.trip || 'No trip number'}</span>
                  <span className="figure shrink-0 text-muted-foreground">{money(c.before)}</span>
                  <span aria-hidden className="text-muted-foreground">to</span>
                  <span className="figure shrink-0 font-semibold">{money(c.after)}</span>
                </li>
              ))}
              {plan.changes.length > 8 && (
                <li className="py-2 text-[13px] text-muted-foreground">and {plan.changes.length - 8} more</li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2 border-t py-3">
              <Button className="h-11" onClick={handleApply} disabled={applying}>
                {applying ? 'Updating' : `Update ${plan.changes.length} ${plan.changes.length === 1 ? 'load' : 'loads'}`}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setPlan(null)} disabled={applying}>Cancel</Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
