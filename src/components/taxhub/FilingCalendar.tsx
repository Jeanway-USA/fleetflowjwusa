import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ChevronDown, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MarkFiledDialog } from '@/components/finance/inhouse-payroll/MarkFiledDialog';
import { VoidExemptDialog } from '@/components/finance/inhouse-payroll/VoidExemptDialog';
import { buildFederalDeadlines, buildStateDeadlines, FilingTable, isStateFormRegistered, keyFor, summarizeDeadlines, type CompletionRow } from '@/components/finance/inhouse-payroll/filing-registry-shared';
import type { useTaxHub } from '@/hooks/useTaxHub';

type Hub = NonNullable<ReturnType<typeof useTaxHub>['data']>;

/** Every filing for the tax year with its real due date, and a place to record that it was filed and paid. Filed rows lock for audit. */
export function FilingCalendar({ hub, year }: { hub: Hub; year: number }) {
  const { orgId } = useAuth();
  const today = new Date();
  const [dialog, setDialog] = useState<{ key: string; label: string } | null>(null);
  const [voidDialog, setVoidDialog] = useState<{ key: string; label: string } | null>(null);

  const federal = useMemo(() => buildFederalDeadlines(year), [year]);
  const stateInputs = useMemo(() => hub.states.map((s) => ({ code: s.code, hasStateIncomeTax: s.info?.sit !== 'none' })), [hub.states]);
  const byState = useMemo(() => buildStateDeadlines(year, stateInputs), [year, stateInputs]);

  const { data: completions = [] } = useQuery({
    queryKey: ['tax_filing_completions', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('tax_filing_completions').select('*').eq('org_id', orgId!);
      if (error) throw error;
      return (data ?? []) as CompletionRow[];
    },
  });
  const completionMap = useMemo(() => new Map(completions.map((c) => [c.form_key, c])), [completions]);
  const fedMap = useMemo(() => { const keys = new Set(federal.map(keyFor)); return new Map([...completionMap].filter(([k]) => keys.has(k))); }, [completionMap, federal]);
  const hasGeneric = stateInputs.some((s) => !isStateFormRegistered(s.code));

  const act = { onMarkFiled: (key: string, label: string) => setDialog({ key, label }), onVoid: (key: string, label: string) => setVoidDialog({ key, label }) };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl"><CalendarClock className="h-5 w-5" aria-hidden />Filing calendar for {year}</CardTitle>
        <CardDescription>Mark each return filed and paid once you have the confirmation number. Marked rows lock so the record cannot be changed later.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilingTable deadlines={federal} completionMap={fedMap} today={today} {...act} />
        {hasGeneric && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">Texas and Washington file by the last day of the month after each quarter. For other states the same date is shown as a placeholder: each state sets its own return names and due dates, so confirm them with the state.</AlertDescription>
          </Alert>
        )}
        {stateInputs.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">State filings appear once pay is recorded for a state.</p>}
        {stateInputs.map((s) => {
          const deadlines = byState[s.code] ?? [];
          const { overdue, dueSoon, pending } = summarizeDeadlines(deadlines, completionMap, today);
          return (
            <Collapsible key={s.code} defaultOpen={overdue > 0 || dueSoon > 0}>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{hub.states.find((x) => x.code === s.code)?.info?.name ?? s.code}</span>
                    {!isStateFormRegistered(s.code) && <Badge variant="outline" className="gap-1 rounded-sm text-xs font-normal"><AlertTriangle className="h-3 w-3" />Confirm dates</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {overdue > 0 && <Badge variant="destructive" className="rounded-sm">{overdue} overdue</Badge>}
                    {dueSoon > 0 && <Badge className="rounded-sm bg-warning hover:bg-warning">{dueSoon} due soon</Badge>}
                    <span className="text-muted-foreground">{pending} pending</span>
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-3 pt-2">
                <FilingTable deadlines={deadlines} completionMap={completionMap} today={today} {...act} />
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
      {dialog && <MarkFiledDialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)} formKey={dialog.key} formLabel={dialog.label} />}
      {voidDialog && <VoidExemptDialog open={!!voidDialog} onOpenChange={(v) => !v && setVoidDialog(null)} formKey={voidDialog.key} formLabel={voidDialog.label} />}
    </Card>
  );
}
