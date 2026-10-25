import { todayLocal } from '@/lib/datetime';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared/FormParts';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { useAuth } from '@/contexts/AuthContext';
import {
  isMissingTables,
  useAssignPackage,
  useCreateOverride,
  useDriverAssignments,
  useDriverOverrides,
  useEndAssignment,
  usePackageComponents,
  usePayPackages,
  useVoidOverride,
} from '@/hooks/usePayPackages';
import { useChecklistItem, usePersonPositions, usePositions } from '@/hooks/usePositions';
import { assignmentOn } from '@/lib/pay-packages/resolve';
import { checkFormula } from '@/lib/pay-packages/formula';
import { FORMULA_VARIABLES, type ComponentOverride, type ExtraLine } from '@/lib/pay-packages/types';
import { formatDate } from '@/lib/formatters';

const today = () => todayLocal();
const VARIABLE_NAMES = FORMULA_VARIABLES.map((v) => v.name);

interface OverrideRow {
  componentId: string;
  mode: 'value' | 'formula' | 'off';
  value: string;
  formula: string;
}

function OverrideDialog({ driverId, packageId, open, onOpenChange }: { driverId: string; packageId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { orgId } = useAuth();
  const { data: components = [] } = usePackageComponents(open ? packageId : null);
  const create = useCreateOverride();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [extras, setExtras] = useState<Array<{ label: string; amount: string; deduction: boolean }>>([]);

  const reset = () => {
    setPeriodStart('');
    setPeriodEnd('');
    setReason('');
    setRows([]);
    setExtras([]);
  };

  const submit = async () => {
    if (!orgId) return toast.error('Your organization has not finished loading.');
    if (!periodStart || !periodEnd || periodEnd < periodStart) return toast.error('Choose the settlement period this applies to.');
    if (!reason.trim()) return toast.error('Say why, so the change can be explained later.');
    const component_overrides: ComponentOverride[] = [];
    for (const r of rows) {
      if (r.mode === 'off') component_overrides.push({ component_id: r.componentId, is_active: false });
      else if (r.mode === 'value') component_overrides.push({ component_id: r.componentId, value: Number(r.value) || 0 });
      else {
        const problem = checkFormula(r.formula, VARIABLE_NAMES);
        if (problem) return toast.error(problem);
        component_overrides.push({ component_id: r.componentId, formula: r.formula });
      }
    }
    const extra_lines: ExtraLine[] = extras
      .filter((x) => x.label.trim() && Number(x.amount) > 0)
      .map((x) => ({ label: x.label.trim(), amount: Number(x.amount), is_deduction: x.deduction, is_taxable: !x.deduction }));
    if (component_overrides.length === 0 && extra_lines.length === 0) return toast.error('Change at least one pay line, or add an extra line.');
    try {
      await create.mutateAsync({
        orgId,
        override: { driver_id: driverId, package_id: packageId, period_start: periodStart, period_end: periodEnd, component_overrides, extra_lines, reason: reason.trim() },
      });
      toast.success('Override saved. It applies to settlements in that period only.');
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save the override');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !create.isPending && onOpenChange(v)}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle>Change pay for one period</DialogTitle>
          <DialogDescription>The package itself is not changed. This applies only to settlements whose period ends inside these dates.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Period start"><Input type="date" className="h-11" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
            <Field label="Period end"><Input type="date" className="h-11" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
          </div>
          <Field label="Reason"><Input className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Holiday bonus agreed with driver" /></Field>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Pay lines to change</h4>
            {rows.map((r, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <Select value={r.componentId} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, componentId: v } : x)))}>
                    <SelectTrigger className="h-11 flex-1"><SelectValue placeholder="Choose a line" /></SelectTrigger>
                    <SelectContent>{components.map((c) => <SelectItem key={c.id} value={c.id}>{c.label || 'Untitled line'}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={r.mode} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, mode: v as OverrideRow['mode'] } : x)))}>
                    <SelectTrigger className="h-11 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">New amount</SelectItem>
                      <SelectItem value="formula">New formula</SelectItem>
                      <SelectItem value="off">Leave out</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-4 w-4" /></Button>
                </div>
                {r.mode === 'value' && <Input inputMode="decimal" className="h-11" placeholder="Amount, rate or percent" value={r.value} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
                {r.mode === 'formula' && <Input className="h-11 font-mono text-sm" placeholder="miles * 0.6" value={r.formula} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, formula: e.target.value } : x)))} />}
              </div>
            ))}
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setRows([...rows, { componentId: components[0]?.id ?? '', mode: 'value', value: '', formula: '' }])} disabled={components.length === 0}>
              <Plus className="mr-1.5 h-4 w-4" />Change a pay line
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">One-off extra lines</h4>
            {extras.map((x, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                <Input className="h-11 min-w-0 flex-1 basis-40" placeholder="Name, e.g. Holiday bonus" value={x.label} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                <Input inputMode="decimal" className="h-11 w-28" placeholder="Amount" value={x.amount} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
                <label className="flex min-h-[44px] items-center gap-2 text-xs"><Switch checked={x.deduction} onCheckedChange={(v) => setExtras(extras.map((y, j) => (j === i ? { ...y, deduction: v } : y)))} />Deduction</label>
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => setExtras(extras.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setExtras([...extras, { label: '', amount: '', deduction: false }])}>
              <Plus className="mr-1.5 h-4 w-4" />Add an extra line
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-[44px] w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <LoadingButton loading={create.isPending} disabled={create.isPending} onClick={submit} className="min-h-[44px] w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto">Save override</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The pay package for one driver: who it is, since when, its history, and one-period overrides. */
export function DriverPayPackageSection({ driver, userId, suggestedPackageId }: { driver?: { id: string; user_id?: string | null } | null; userId?: string | null; suggestedPackageId?: string | null }) {
  const driverId = driver?.id ?? null;
  const staffUserId = driverId ? null : userId ?? null;
  const { hasPayrollAccess } = useAuth();
  const { data: assignments = [], error } = useDriverAssignments(driverId, staffUserId);
  const { data: packages = [] } = usePayPackages();
  const { data: overrides = [] } = useDriverOverrides(driverId);
  const assign = useAssignPackage();
  const endIt = useEndAssignment();
  const voidIt = useVoidOverride();
  const [packageId, setPackageId] = useState('');
  const [start, setStart] = useState(today());
  const [note, setNote] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);

  // A position suggests a package; it only pre-fills the choice, which stays editable.
  useEffect(() => {
    if (suggestedPackageId) setPackageId(suggestedPackageId);
  }, [suggestedPackageId]);

  const { data: positionAssignments = [] } = usePersonPositions({ driverId, userId: staffUserId });
  const { data: allPositions = [] } = usePositions();
  const tickStep = useChecklistItem();
  const heldNow = positionAssignments.find((a) => !a.effective_end);
  const heldPosition = allPositions.find((p) => p.id === heldNow?.position_id);
  const positionStep = heldNow && heldPosition ? { assignmentId: heldNow.id, steps: heldPosition.onboarding_checklist, progress: heldNow.checklist_progress } : null;

  const nameOf = (id: string) => packages.find((p) => p.id === id)?.name ?? 'Pay package';
  const current = useMemo(() => assignmentOn(assignments, today()), [assignments]);
  const choices = packages.filter((p) => !p.archived_at && p.is_active);

  // Nothing to show before the database update is applied, and nothing for people who have no package to see.
  if (error && isMissingTables(error)) return null;
  if (!hasPayrollAccess && assignments.length === 0) return null;

  const submit = async () => {
    if (!packageId) return toast.error('Choose a package.');
    if (!start) return toast.error('Choose the date it takes effect.');
    try {
      await assign.mutateAsync({ driverId, userId: staffUserId, packageId, start, note: note.trim() || undefined });
      // If their position's checklist has a step about the pay package, it is now done.
      const step = positionStep?.steps.find((s) => /pay package/i.test(s.label) && !positionStep.progress[s.id]);
      if (step && positionStep) tickStep.mutate({ assignmentId: positionStep.assignmentId, itemId: step.id, done: true });
      toast.success('Pay package assigned. Earlier settlements keep the package they were paid under.');
      setPackageId('');
      setNote('');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not assign the package');
    }
  };

  return (
    <>
    <Separator />
    <div className="space-y-3 py-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-medium">Pay package</h4>
      </div>

      {current ? (
        <p className="text-sm">
          <span className="font-medium">{nameOf(current.package_id)}</span>
          <span className="text-muted-foreground"> · since {formatDate(current.effective_start)}{current.effective_end ? `, until ${formatDate(current.effective_end)}` : ''}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No package assigned. This driver is paid with the standard pay settings.</p>
      )}

      {hasPayrollAccess && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Package">
              <Select value={packageId} onValueChange={setPackageId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Choose a package" /></SelectTrigger>
                <SelectContent>{choices.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Takes effect"><Input type="date" className="h-11" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          </div>
          <Input className="h-11" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <LoadingButton loading={assign.isPending} disabled={assign.isPending || !packageId} onClick={submit} className="min-h-[44px] w-full sm:w-auto">
            {current ? 'Change package' : 'Assign package'}
          </LoadingButton>
        </div>
      )}

      {assignments.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Assignment history</p>
          <ul className="divide-y rounded-lg border text-sm">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                <span className="min-w-0">
                  <span className="font-medium">{nameOf(a.package_id)}</span>
                  <span className="block text-xs text-muted-foreground">{formatDate(a.effective_start)} to {a.effective_end ? formatDate(a.effective_end) : 'now'}</span>
                </span>
                {hasPayrollAccess && !a.effective_end && (
                  <Button variant="ghost" className="min-h-[44px]" onClick={() => endIt.mutate({ id: a.id, endDate: today() })}>End today</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasPayrollAccess && current && driverId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">One-period overrides</p>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setOverrideOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />Add
            </Button>
          </div>
          {overrides.length === 0 && <p className="text-xs text-muted-foreground">None. Use an override to change pay for a single settlement period without editing the package.</p>}
          <ul className="space-y-1">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-2 rounded-lg border p-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{formatDate(o.period_start)} to {formatDate(o.period_end)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.component_overrides.length} changed line{o.component_overrides.length === 1 ? '' : 's'}, {o.extra_lines.length} extra{o.reason ? ` · ${o.reason}` : ''}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={async () => {
                    try {
                      await voidIt.mutateAsync(o.id);
                      toast.success('Override cancelled. It stays on record as voided.');
                    } catch (e: any) {
                      toast.error(e.message ?? 'Could not cancel the override');
                    }
                  }}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
          <OverrideDialog driverId={driverId} packageId={current.package_id} open={overrideOpen} onOpenChange={setOverrideOpen} />
        </div>
      )}
      {!hasPayrollAccess && current && <Badge variant="outline" className="text-xs">Only owners and payroll admins can change this</Badge>}
    </div>
    </>
  );
}
