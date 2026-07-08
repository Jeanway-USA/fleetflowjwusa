import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarClock, AlertTriangle, CheckCircle2, Lock, Ban, ChevronDown } from 'lucide-react';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { MarkFiledDialog } from './MarkFiledDialog';
import { VoidExemptDialog } from './VoidExemptDialog';

interface Deadline {
  form: string;
  scope: string;
  dueDate: Date;
  jurisdiction: string;
}

function buildDeadlines(today: Date): Deadline[] {
  const y = today.getFullYear();

  const q941 = [
    { end: new Date(y, 2, 31), due: new Date(y, 3, 30) },
    { end: new Date(y, 5, 30), due: new Date(y, 6, 31) },
    { end: new Date(y, 8, 30), due: new Date(y, 9, 31) },
    { end: new Date(y, 11, 31), due: new Date(y + 1, 0, 31) },
  ];
  const list: Deadline[] = q941.map((q) => ({
    form: 'Form 941',
    scope: `Employer quarterly payroll (through ${format(q.end, 'MMM d')})`,
    dueDate: q.due,
    jurisdiction: 'Federal (IRS)',
  }));

  list.push({
    form: 'Form 940',
    scope: `Annual FUTA reconciliation (${y})`,
    dueDate: new Date(y + 1, 0, 31),
    jurisdiction: 'Federal (IRS)',
  });
  list.push({
    form: 'W-2 / 1099-NEC',
    scope: `Recipient copies & filing (${y})`,
    dueDate: new Date(y + 1, 0, 31),
    jurisdiction: 'Federal / SSA',
  });

  const twc = [
    new Date(y, 3, 30), new Date(y, 6, 31),
    new Date(y, 9, 31), new Date(y + 1, 0, 31),
  ];
  twc.forEach((d, i) => list.push({
    form: 'Form C-3',
    scope: `TX SUI (Q${i + 1} ${y})`,
    dueDate: d,
    jurisdiction: 'Texas TWC',
  }));

  const flQ = [
    new Date(y, 3, 30), new Date(y, 6, 31),
    new Date(y, 9, 31), new Date(y + 1, 0, 31),
  ];
  flQ.forEach((d, i) => list.push({
    form: 'Form RT-6',
    scope: `FL reemployment (Q${i + 1} ${y})`,
    dueDate: d,
    jurisdiction: 'Florida DOR',
  }));

  return list.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

const keyFor = (d: Deadline) =>
  `${d.form}|${d.scope}|${d.dueDate.toISOString().slice(0, 10)}`;

export function TaxFilingRegistryTab() {
  const today = new Date();
  const { orgId } = useAuth();
  const deadlines = useMemo(() => buildDeadlines(today), []);
  const [dialog, setDialog] = useState<{ key: string; label: string } | null>(null);

  const { data: completions = [] } = useQuery({
    queryKey: ['tax_filing_completions', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_filing_completions')
        .select('*')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const completionMap = useMemo(() => {
    const m = new Map<string, (typeof completions)[number]>();
    completions.forEach((c) => m.set(c.form_key, c));
    return m;
  }, [completions]);

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> W-2 / 1099 Audit Registry
        </CardTitle>
        <CardDescription>
          Quarterly and annual filing deadlines. Once a filing is submitted, click
          "Mark Filed & Paid" to record the confirmation reference — completed rows
          lock as a permanent audit record.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deadlines.map((d) => {
                const key = keyFor(d);
                const completion = completionMap.get(key);
                const days = differenceInCalendarDays(d.dueDate, today);
                let badge;
                if (completion) {
                  badge = (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Completed
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div>Ref: <span className="font-mono">{completion.confirmation_reference}</span></div>
                          <div>Filed: {format(parseISO(completion.filed_on), 'MMM d, yyyy')}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                } else if (days < 0) {
                  badge = <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Overdue</Badge>;
                } else if (days <= 30) {
                  badge = <Badge className="bg-amber-500 hover:bg-amber-600">Due in {days}d</Badge>;
                } else {
                  badge = <Badge variant="secondary">In {days}d</Badge>;
                }
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">{d.form}</TableCell>
                    <TableCell className="text-sm">{d.scope}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.jurisdiction}</TableCell>
                    <TableCell>{format(d.dueDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell>{badge}</TableCell>
                    <TableCell className="text-right">
                      {completion ? (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      ) : (
                        <Button size="sm" variant="outline"
                          onClick={() => setDialog({ key, label: `${d.form} — ${d.scope}` })}>
                          Mark Filed & Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {dialog && (
        <MarkFiledDialog
          open={!!dialog}
          onOpenChange={(v) => !v && setDialog(null)}
          formKey={dialog.key}
          formLabel={dialog.label}
        />
      )}
    </Card>
  );
}
