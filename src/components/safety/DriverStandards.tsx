import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Panel } from '@/components/finance/statement-ui';
import { CheckList, STATUS_UI } from '@/components/safety/CheckList';
import { SafetyFileSlot } from '@/components/safety/SafetyFileSlot';
import { SAFETY_KEY } from '@/hooks/useSafetyData';
import { supabase } from '@/integrations/supabase/client';
import { driverChecks, needsAction, worst, type Check } from '@/lib/safety/compliance';
import type { SafetyFile } from '@/lib/safety/files';
import { cn } from '@/lib/utils';

const db = supabase as any;
const nameOf = (d: any) => `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || 'Unnamed driver';

export interface DriverRow { driver: any; name: string; checks: Check[]; status: ReturnType<typeof worst> }

/** Every driver's checks, worst first. Shared with the Overview tab. */
export function driverRows(drivers: any[], files: SafetyFile[], incidents: any[], today: string): DriverRow[] {
  const sev = { overdue: 5, missing: 4, review: 3, soon: 2, ok: 1, info: 0 } as const;
  return drivers
    .map((driver) => {
      const checks = driverChecks({ driver, files, incidents, today });
      return { driver, name: nameOf(driver), checks, status: worst(checks) };
    })
    .sort((a, b) => sev[b.status] - sev[a.status] || a.name.localeCompare(b.name));
}

function ApprovalDate({ driver, canEdit }: { driver: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>(driver.landstar_approved_on ?? '');
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('drivers').update({ landstar_approved_on: value || null }).eq('id', driver.id);
      if (error) throw new Error(/landstar_approved_on/.test(error.message) ? 'The database update for the Safety page has not been applied yet.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: SAFETY_KEY }); toast.success('Saved.'); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <div>
        <Label className="text-xs">Date Landstar approved this driver</Label>
        <Input type="date" className="h-10" value={value} disabled={!canEdit} onChange={(e) => setValue(e.target.value)} />
      </div>
      {canEdit && <Button variant="outline" className="h-10" disabled={save.isPending || value === (driver.landstar_approved_on ?? '')} onClick={() => save.mutate()}>Save</Button>}
      <p className="basis-full text-xs text-muted-foreground">Landstar operator ID, license, medical card, hazmat and MVR dates are kept on the <Link to="/drivers" className="underline">Drivers</Link> page.</p>
    </div>
  );
}

/** Each driver against Landstar's minimums and the DOT items JeanWay keeps current. */
export function DriverStandards({ drivers, files, filesReady, incidents, today, canEdit, orgId, userId }: {
  drivers: any[]; files: SafetyFile[]; filesReady: boolean; incidents: any[]; today: string; canEdit: boolean; orgId: string | null; userId: string | null;
}) {
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => driverRows(drivers.filter((d) => showInactive || d.status === 'active'), files, incidents, today), [drivers, files, incidents, today, showInactive]);
  const inactiveCount = drivers.filter((d) => d.status !== 'active').length;

  return (
    <Panel
      title="Driver standards"
      description="Each driver against Landstar's minimums and the DOT items we keep current. Landstar keeps the official driver files and runs drug and alcohol testing."
      aside={inactiveCount > 0 ? <label className="flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={showInactive} onCheckedChange={setShowInactive} />Show {inactiveCount} not active</label> : undefined}
    >
      {rows.length === 0 ? <p className="border-t py-4 text-sm text-muted-foreground">No drivers to show.</p> : (
        <ul className="space-y-2 border-t pt-3">
          {rows.map((r) => {
            const issues = r.checks.filter((c) => needsAction(c.status)).length;
            const ui = STATUS_UI[r.status];
            return (
              <li key={r.driver.id}>
                <Collapsible open={open === r.driver.id} onOpenChange={(v) => setOpen(v ? r.driver.id : null)}>
                  <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent">
                    <span className="font-medium">{r.name}</span>
                    {r.driver.status !== 'active' && <span className="text-xs text-muted-foreground">not active</span>}
                    <span className={cn('ml-auto text-sm', ui.text)}>{issues === 0 ? 'All current' : `${issues} to fix`}</span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open === r.driver.id && 'rotate-180')} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <CheckList checks={r.checks} />
                    <SafetyFileSlot subjectType="driver" subjectId={r.driver.id} kind="mvr" files={files} ready={filesReady} canEdit={canEdit} orgId={orgId} userId={userId} dateLabel="Date the MVR was pulled" />
                    <ApprovalDate driver={r.driver} canEdit={canEdit} />
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
