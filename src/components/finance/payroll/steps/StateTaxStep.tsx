import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, MapPin } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import {
  getStateTaxRequirements,
  submitStateTaxRequirements,
} from '@/services/gustoCompanyApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface Requirement {
  key: string;
  label?: string;
  description?: string;
  value?: string | number | null;
  type?: string;
  [k: string]: unknown;
}
interface RequirementSet {
  key: string;
  label?: string;
  requirements?: Requirement[];
  [k: string]: unknown;
}

/**
 * State tax step: for each unique 2-char driver.tax_state, fetches Gusto's
 * per-state tax requirements and lets the operator fill in the required
 * account IDs / SUI rates and submit them.
 */
export function StateTaxStep() {
  const { data: driverStates, isLoading } = useQuery({
    queryKey: ['payroll-driver-tax-states'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from('drivers')
        .select('tax_state, home_state')
        .eq('driver_type', 'W-2 Employee');
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((d: any) => {
        const s = (d.tax_state || d.home_state || '').toString().toUpperCase().trim();
        if (/^[A-Z]{2}$/.test(s)) set.add(s);
      });
      return Array.from(set).sort();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" />
          State tax registrations
        </CardTitle>
        <CardDescription>
          Gusto files SUTA and state withholding for every state where a W-2
          driver lives. Enter the account IDs and SUI rate for each state your
          drivers work in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading driver states…
          </div>
        ) : !driverStates || driverStates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No W-2 drivers with a home/tax state yet. Add drivers to see state tax steps.
          </p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {driverStates.map((state) => (
              <AccordionItem key={state} value={state} className="rounded-lg border px-3">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <span className="flex items-center gap-2 font-medium">{state}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <StateTaxPanel state={state} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

function StateTaxPanel({ state }: { state: string }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['gusto-state-tax-reqs', state],
    queryFn: async () => {
      const res = await getStateTaxRequirements(state);
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    retry: false,
  });

  const reqSets = useMemo<RequirementSet[]>(() => {
    const raw = (data?.requirements as any) ?? {};
    const list = raw.requirement_sets ?? raw.state?.requirement_sets ?? [];
    return Array.isArray(list) ? list : [];
  }, [data]);

  const setField = (setKey: string, reqKey: string, v: string) => {
    setValues((prev) => ({
      ...prev,
      [setKey]: { ...(prev[setKey] ?? {}), [reqKey]: v },
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = reqSets.map((s) => ({
        key: s.key,
        requirements: (s.requirements ?? []).map((r) => ({
          key: r.key,
          value: values[s.key]?.[r.key] ?? r.value ?? '',
        })),
      }));
      const res = await submitStateTaxRequirements({ state, requirementSets: payload });
      if (!res.ok) throw new Error(res.error);
      toast.success(`${state} tax requirements submitted.`);
      await refetch();
      qc.invalidateQueries({ queryKey: ['gusto-onboarding-steps'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading {state} requirements…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as Error).message || `Could not load ${state} requirements`}
      </p>
    );
  }
  if (reqSets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open tax requirements for {state}. <Badge variant="outline" className="ml-2 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Ready
        </Badge>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {reqSets.map((s) => (
        <div key={s.key} className="rounded-md border p-3">
          <div className="text-sm font-medium">{s.label ?? s.key}</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(s.requirements ?? []).map((r) => (
              <div key={r.key} className="space-y-1">
                <Label htmlFor={`${state}-${s.key}-${r.key}`} className="text-xs">
                  {r.label ?? r.key}
                </Label>
                <Input
                  id={`${state}-${s.key}-${r.key}`}
                  defaultValue={(r.value ?? '').toString()}
                  onChange={(e) => setField(s.key, r.key, e.target.value)}
                />
                {r.description ? (
                  <p className="text-[11px] text-muted-foreground">{r.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button onClick={handleSubmit} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit {state} requirements
      </Button>
    </div>
  );
}
