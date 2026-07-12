import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock } from 'lucide-react';
import { MarkFiledDialog } from './MarkFiledDialog';
import { VoidExemptDialog } from './VoidExemptDialog';
import {
  buildFederalDeadlines, FilingTable, keyFor,
  type CompletionRow,
} from './filing-registry-shared';

export function FederalFilingRegistry() {
  const today = new Date();
  const { orgId } = useAuth();
  const deadlines = useMemo(() => buildFederalDeadlines(today), []);
  const [dialog, setDialog] = useState<{ key: string; label: string } | null>(null);
  const [voidDialog, setVoidDialog] = useState<{ key: string; label: string } | null>(null);

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

  // Filter to federal keys only (defensive — state completions live in the other registry)
  const federalKeys = new Set(deadlines.map(keyFor));
  const federalCompletionMap = useMemo(() => {
    const m = new Map<string, CompletionRow>();
    completionMap.forEach((v, k) => { if (federalKeys.has(k)) m.set(k, v); });
    return m;
  }, [completionMap]);

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Federal Filings — IRS / SSA
        </CardTitle>
        <CardDescription>
          Form 941 (quarterly), Form 940 (annual FUTA), and W-2 / 1099-NEC transmittals.
          Marking a form filed here locks the row for audit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FilingTable
          deadlines={deadlines}
          completionMap={federalCompletionMap}
          today={today}
          onMarkFiled={(key, label) => setDialog({ key, label })}
          onVoid={(key, label) => setVoidDialog({ key, label })}
        />
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
