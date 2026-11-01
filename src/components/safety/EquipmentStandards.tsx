import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Panel } from '@/components/finance/statement-ui';
import { CheckList, STATUS_UI } from '@/components/safety/CheckList';
import { SafetyFileSlot } from '@/components/safety/SafetyFileSlot';
import { equipmentChecks, needsAction, worst, type Check } from '@/lib/safety/compliance';
import type { SafetyFile } from '@/lib/safety/files';
import { cn } from '@/lib/utils';

export interface EquipmentRow { id: string; kind: 'truck' | 'trailer'; title: string; subtitle: string; checks: Check[]; status: ReturnType<typeof worst> }

/** Every truck and trailer's checks, worst first. Shared with the Overview tab. */
export function equipmentRows(trucks: any[], trailers: any[], files: SafetyFile[], today: string): EquipmentRow[] {
  const sev = { overdue: 5, missing: 4, review: 3, soon: 2, ok: 1, info: 0 } as const;
  const rows: EquipmentRow[] = [
    ...trucks.map((t) => ({ id: t.id, kind: 'truck' as const, title: `Truck ${t.unit_number}`, subtitle: [t.year, t.make, t.model].filter(Boolean).join(' ') || 'Tractor', item: { id: t.id, kind: 'truck' as const, status: t.status, last_inspection: t.last_120_inspection_date, next_inspection: t.next_inspection_date } })),
    ...trailers.map((t) => ({ id: t.id, kind: 'trailer' as const, title: `Trailer ${t.unit_number}`, subtitle: [t.year, t.make, t.trailer_type].filter(Boolean).join(' ') || 'Trailer', item: { id: t.id, kind: 'trailer' as const, status: t.status, last_inspection: t.last_inspection_date, next_inspection: t.next_inspection_date } })),
  ].map(({ item, ...rest }) => {
    const checks = equipmentChecks({ item, files, today });
    return { ...rest, checks, status: worst(checks) };
  });
  return rows.sort((a, b) => sev[b.status] - sev[a.status] || a.title.localeCompare(b.title, undefined, { numeric: true }));
}

/** Each tractor and trailer against Landstar's 120-day inspection and the federal annual inspection. */
export function EquipmentStandards({ trucks, trailers, files, filesReady, today, canEdit, orgId, userId }: {
  trucks: any[]; trailers: any[]; files: SafetyFile[]; filesReady: boolean; today: string; canEdit: boolean; orgId: string | null; userId: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => equipmentRows(trucks, trailers, files, today), [trucks, trailers, files, today]);
  return (
    <Panel
      title="Equipment standards"
      description="Landstar inspects every leased tractor and trailer every 120 days at an approved facility. The federal rule is once a year, so a current 120-day inspection covers both."
    >
      {rows.length === 0 ? <p className="border-t py-4 text-sm text-muted-foreground">No trucks or trailers to show.</p> : (
        <ul className="space-y-2 border-t pt-3">
          {rows.map((r) => {
            const issues = r.checks.filter((c) => needsAction(c.status)).length;
            const ui = STATUS_UI[r.status];
            return (
              <li key={`${r.kind}-${r.id}`}>
                <Collapsible open={open === `${r.kind}-${r.id}`} onOpenChange={(v) => setOpen(v ? `${r.kind}-${r.id}` : null)}>
                  <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent">
                    <span className="font-medium">{r.title}</span>
                    <span className="hidden text-sm text-muted-foreground sm:inline">{r.subtitle}</span>
                    <span className={cn('ml-auto text-sm', ui.text)}>{issues === 0 ? 'All current' : `${issues} to fix`}</span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open === `${r.kind}-${r.id}` && 'rotate-180')} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <CheckList checks={r.checks} />
                    <SafetyFileSlot subjectType={r.kind} subjectId={r.id} kind="inspection_report" files={files} ready={filesReady} canEdit={canEdit} orgId={orgId} userId={userId} dateLabel="Date of the inspection" />
                    <p className="text-xs text-muted-foreground">Inspection dates come from the Shop's work log. Log a finished inspection there to reset the 120 days. See the <Link to={r.kind === 'truck' ? '/trucks' : '/trailers'} className="underline">{r.kind === 'truck' ? 'Trucks' : 'Trailers'}</Link> page for the rest of this unit.</p>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
