import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, Lock, Ban } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';

export interface Deadline {
  form: string;
  scope: string;
  dueDate: Date;
  jurisdiction: string;
}

export interface CompletionRow {
  form_key: string;
  is_exempt: boolean | null;
  exempt_reason: string | null;
  confirmation_reference: string | null;
  filed_on: string | null;
}

export const keyFor = (d: Deadline) =>
  `${d.form}|${d.scope}|${d.dueDate.toISOString().slice(0, 10)}`;

// ---------------- Federal deadlines ----------------
export function buildFederalDeadlines(today: Date): Deadline[] {
  const y = today.getFullYear();
  const list: Deadline[] = [];

  const q941 = [
    { end: new Date(y, 2, 31), due: new Date(y, 3, 30) },
    { end: new Date(y, 5, 30), due: new Date(y, 6, 31) },
    { end: new Date(y, 8, 30), due: new Date(y, 9, 31) },
    { end: new Date(y, 11, 31), due: new Date(y + 1, 0, 31) },
  ];
  q941.forEach((q) => list.push({
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

  return list.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

// ---------------- State deadlines ----------------
interface StateFormMeta {
  sutaForm: string;
  agency: string;
}
const STATE_FORMS: Record<string, StateFormMeta> = {
  TX: { sutaForm: 'Form C-3', agency: 'Texas TWC' },
  FL: { sutaForm: 'Form RT-6', agency: 'Florida DOR' },
};

export interface StateInput {
  code: string;
  hasStateIncomeTax?: boolean;
}

/** Returns deadlines grouped by state code. */
export function buildStateDeadlines(today: Date, states: StateInput[]): Record<string, Deadline[]> {
  const y = today.getFullYear();
  const quarters = [
    { label: 'Q1', due: new Date(y, 3, 30) },
    { label: 'Q2', due: new Date(y, 6, 31) },
    { label: 'Q3', due: new Date(y, 9, 31) },
    { label: 'Q4', due: new Date(y + 1, 0, 31) },
  ];

  const out: Record<string, Deadline[]> = {};
  for (const s of states) {
    const code = s.code.toUpperCase();
    const meta = STATE_FORMS[code];
    const jurisdiction = meta?.agency ?? `${code} state agency`;
    const sutaForm = meta?.sutaForm ?? 'SUTA Return';
    const list: Deadline[] = [];

    quarters.forEach((q) => list.push({
      form: sutaForm,
      scope: `${code} SUTA (${q.label} ${y})`,
      dueDate: q.due,
      jurisdiction,
    }));

    if (s.hasStateIncomeTax) {
      quarters.forEach((q) => list.push({
        form: 'State Withholding',
        scope: `${code} SIT (${q.label} ${y})`,
        dueDate: q.due,
        jurisdiction,
      }));
    }

    out[code] = list.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }
  return out;
}

/** Whether the state code has a real form-name mapping (vs. generic fallback). */
export function isStateFormRegistered(code: string): boolean {
  return !!STATE_FORMS[code.toUpperCase()];
}

// ---------------- Presentational: single filings table ----------------
interface FilingTableProps {
  deadlines: Deadline[];
  completionMap: Map<string, CompletionRow>;
  today: Date;
  onMarkFiled: (key: string, label: string) => void;
  onVoid: (key: string, label: string) => void;
  showJurisdiction?: boolean;
}

export function FilingTable({
  deadlines, completionMap, today, onMarkFiled, onVoid, showJurisdiction = true,
}: FilingTableProps) {
  const active = deadlines.filter((d) => !completionMap.get(keyFor(d))?.is_exempt);
  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No active filings.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Form</TableHead>
            <TableHead>Scope</TableHead>
            {showJurisdiction && <TableHead>Jurisdiction</TableHead>}
            <TableHead>Due Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.map((d) => {
            const key = keyFor(d);
            const completion = completionMap.get(key);
            const days = differenceInCalendarDays(d.dueDate, today);
            let badge: JSX.Element;
            if (completion && !completion.is_exempt) {
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
                      <div>Filed: {completion.filed_on ? format(parseISO(completion.filed_on), 'MMM d, yyyy') : '—'}</div>
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
            const label = `${d.form} — ${d.scope}`;
            return (
              <TableRow key={key}>
                <TableCell className="font-medium">{d.form}</TableCell>
                <TableCell className="text-sm">{d.scope}</TableCell>
                {showJurisdiction && <TableCell className="text-sm text-muted-foreground">{d.jurisdiction}</TableCell>}
                <TableCell>{format(d.dueDate, 'MMM d, yyyy')}</TableCell>
                <TableCell>{badge}</TableCell>
                <TableCell className="text-right">
                  {completion ? (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  ) : (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => onVoid(key, label)}>
                        <Ban className="h-3.5 w-3.5 mr-1" /> Void / Exempt
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onMarkFiled(key, label)}>
                        Mark Filed & Paid
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Counts of pending / overdue rows for a set of deadlines. */
export function summarizeDeadlines(deadlines: Deadline[], completionMap: Map<string, CompletionRow>, today: Date) {
  let overdue = 0;
  let dueSoon = 0;
  let pending = 0;
  for (const d of deadlines) {
    const c = completionMap.get(keyFor(d));
    if (c?.is_exempt) continue;
    if (c && !c.is_exempt) continue;
    pending += 1;
    const days = differenceInCalendarDays(d.dueDate, today);
    if (days < 0) overdue += 1;
    else if (days <= 30) dueSoon += 1;
  }
  return { overdue, dueSoon, pending };
}
