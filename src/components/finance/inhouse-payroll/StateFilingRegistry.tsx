import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Landmark, Info, AlertTriangle } from 'lucide-react';
import { MarkFiledDialog } from './MarkFiledDialog';
import { VoidExemptDialog } from './VoidExemptDialog';
import {
  buildStateDeadlines, FilingTable, summarizeDeadlines, isStateFormRegistered,
  type CompletionRow, type StateInput,
} from './filing-registry-shared';

export function StateFilingRegistry() {
  const today = new Date();
  const { orgId } = useAuth();
  const [dialog, setDialog] = useState<{ key: string; label: string } | null>(null);
  const [voidDialog, setVoidDialog] = useState<{ key: string; label: string } | null>(null);

  // States with active W-2 drivers
  const { data: driverStates = [] } = useQuery({
    queryKey: ['driver_tax_states', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('tax_state, status')
        .eq('org_id', orgId!)
        .neq('status', 'terminated');
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((d: any) => {
        if (d.tax_state) set.add(String(d.tax_state).toUpperCase());
      });
      return Array.from(set);
    },
  });

  // State tax configurations to know which states have SIT
  const { data: stateConfigs = [] } = useQuery({
    queryKey: ['state_tax_configs_registry', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('state_tax_configurations' as never)
        .select('state_code, has_state_income_tax')
        .eq('org_id', orgId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const states: StateInput[] = useMemo(() => {
    const cfgMap = new Map<string, boolean>();
    for (const c of stateConfigs) {
      cfgMap.set(String(c.state_code).toUpperCase(), !!c.has_state_income_tax);
    }
    // Only states where we actually have active drivers
    const all = new Set<string>(driverStates);
    return Array.from(all).sort().map((code) => ({
      code,
      hasStateIncomeTax: cfgMap.get(code) ?? false,
    }));
  }, [driverStates, stateConfigs]);

  const deadlinesByState = useMemo(() => buildStateDeadlines(today, states), [states]);

  const { data: completions = [] } = useQuery({
    queryKey: ['tax_filing_completions', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_filing_completions')
        .select('*')
        .eq('org_id', orgId!);
      if (error) throw error;
      return (data ?? []) as CompletionRow[];
    },
  });

  const completionMap = useMemo(() => {
    const m = new Map<string, CompletionRow>();
    completions.forEach((c) => m.set(c.form_key, c));
    return m;
  }, [completions]);

  const hasGenericStates = states.some((s) => !isStateFormRegistered(s.code));

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" /> State Filing Deadlines
        </CardTitle>
        <CardDescription>
          SUTA and state income-tax deadlines, grouped by state. Only states with active W-2 drivers or an existing tax
          configuration are shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasGenericStates && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Generic quarterly placeholders are shown for states without a built-in form catalog. Verify each form name
              and due date with the state agency before filing.
            </AlertDescription>
          </Alert>
        )}

        {states.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No W-2 employees with a tax state assigned yet.
          </p>
        )}

        {states.map((s) => {
          const deadlines = deadlinesByState[s.code] ?? [];
          const { overdue, dueSoon, pending } = summarizeDeadlines(deadlines, completionMap, today);
          const defaultOpen = overdue > 0 || dueSoon > 0;
          const known = isStateFormRegistered(s.code);
          return (
            <Collapsible key={s.code} defaultOpen={defaultOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between gap-3 px-3 py-2 border rounded-md hover:bg-muted/40 transition text-left">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{s.code}</span>
                    {!known && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <AlertTriangle className="h-3 w-3" /> Generic
                      </Badge>
                    )}
                    {s.hasStateIncomeTax && (
                      <Badge variant="secondary" className="text-[10px]">SIT</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {overdue > 0 && <Badge variant="destructive">{overdue} overdue</Badge>}
                    {dueSoon > 0 && <Badge className="bg-amber-500 hover:bg-amber-600">{dueSoon} due soon</Badge>}
                    <span className="text-muted-foreground">{pending} pending</span>
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pb-3">
                <FilingTable
                  deadlines={deadlines}
                  completionMap={completionMap}
                  today={today}
                  onMarkFiled={(key, label) => setDialog({ key, label })}
                  onVoid={(key, label) => setVoidDialog({ key, label })}
                  showJurisdiction
                />
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
      {dialog && (
        <MarkFiledDialog
          open={!!dialog}
          onOpenChange={(v) => !v && setDialog(null)}
          formKey={dialog.key}
          formLabel={dialog.label}
        />
      )}
      {voidDialog && (
        <VoidExemptDialog
          open={!!voidDialog}
          onOpenChange={(v) => !v && setVoidDialog(null)}
          formKey={voidDialog.key}
          formLabel={voidDialog.label}
        />
      )}
    </Card>
  );
}
