import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared/FormParts';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { supabase } from '@/integrations/supabase/client';
import { usePayPackages } from '@/hooks/usePayPackages';
import { usePositions } from '@/hooks/usePositions';
import { assignPackage, fetchAssignments } from '@/lib/pay-packages/api';
import { assignPosition, fetchPositionAssignments } from '@/lib/positions/api';
import { suggestFromPosition } from '@/lib/positions/defaults';
import { assignmentOn } from '@/lib/pay-packages/resolve';

const NONE = '__none__';
const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Give a position and/or a pay package to many drivers in one go. Anyone who already has it is left as they are. */
export function BulkAssignDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { data: positions = [] } = usePositions();
  const { data: packages = [] } = usePayPackages();
  const [positionId, setPositionId] = useState(NONE);
  const [packageId, setPackageId] = useState(NONE);
  const [start, setStart] = useState(today());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ['bulk-assign', 'drivers'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('id, first_name, last_name, status').is('deleted_at', null).order('last_name');
      if (error) throw error;
      return (data ?? []).filter((d) => d.status === 'active' || d.status == null);
    },
  });
  const { data: current } = useQuery({
    queryKey: ['bulk-assign', 'current'],
    enabled: open,
    queryFn: async () => ({ pay: await fetchAssignments(), pos: await fetchPositionAssignments({}) }),
  });

  const usable = useMemo(() => new Set(packages.filter((p) => !p.archived_at && p.is_active).map((p) => p.id)), [packages]);
  const nameOfPosition = (id: string) => positions.find((p) => p.id === id)?.name;
  const nameOfPackage = (id: string) => packages.find((p) => p.id === id)?.name;

  const heldNow = (driverId: string) => {
    const pay = assignmentOn((current?.pay ?? []).filter((a) => a.driver_id === driverId), today());
    const pos = (current?.pos ?? []).find((a) => a.driver_id === driverId && !a.effective_end);
    return { pay, pos };
  };

  const pickPosition = (id: string) => {
    setPositionId(id);
    const p = positions.find((x) => x.id === id);
    const suggested = p ? suggestFromPosition(p, usable).payPackageId : null;
    if (suggested) setPackageId(suggested);
  };

  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = drivers.length > 0 && picked.size === drivers.length;

  const apply = async () => {
    if (positionId === NONE && packageId === NONE) return toast.error('Choose a position, a pay package, or both.');
    if (picked.size === 0) return toast.error('Tick at least one driver.');
    setBusy(true);
    let changed = 0;
    let unchanged = 0;
    const failed: string[] = [];
    for (const id of picked) {
      const { pay, pos } = heldNow(id);
      try {
        let did = false;
        if (positionId !== NONE && pos?.position_id !== positionId) { await assignPosition({ positionId, driverId: id, start }); did = true; }
        if (packageId !== NONE && pay?.package_id !== packageId) { await assignPackage({ driverId: id, packageId, start }); did = true; }
        did ? changed++ : unchanged++;
      } catch (e: any) {
        failed.push(e.message ?? 'failed');
      }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['positions'] });
    qc.invalidateQueries({ queryKey: ['pay-packages'] });
    qc.invalidateQueries({ queryKey: ['bulk-assign'] });
    if (failed.length > 0) toast.error(`${failed.length} could not be updated: ${failed[0]}`);
    if (changed > 0 || unchanged > 0) toast.success(`${changed} updated${unchanged > 0 ? `, ${unchanged} already had it` : ''}.`);
    if (failed.length === 0) { setPicked(new Set()); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Assign to many drivers</DialogTitle>
          <DialogDescription>Set a position, a pay package, or both for several drivers at once. Earlier assignments are kept as history.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Position">
              <Select value={positionId} onValueChange={pickPosition}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Leave as is</SelectItem>
                  {positions.filter((p) => !p.archived_at).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Pay package">
              <Select value={packageId} onValueChange={setPackageId}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Leave as is</SelectItem>
                  {packages.filter((p) => !p.archived_at && p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Takes effect"><Input type="date" className="h-11" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          </div>

          <div className="rounded-lg border">
            <label className="flex min-h-[44px] items-center gap-2 border-b px-3 text-sm font-medium">
              <Checkbox checked={allOn} onCheckedChange={() => setPicked(allOn ? new Set() : new Set(drivers.map((d) => d.id)))} />
              Select all active drivers ({picked.size} of {drivers.length})
            </label>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {drivers.map((d) => {
                const { pay, pos } = heldNow(d.id);
                return (
                  <li key={d.id}>
                    <label className="flex min-h-[44px] items-center gap-3 px-3 text-sm">
                      <Checkbox checked={picked.has(d.id)} onCheckedChange={() => toggle(d.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{`${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || 'Driver'}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {pos ? nameOfPosition(pos.position_id) ?? 'Position' : 'No position'} · {pay ? nameOfPackage(pay.package_id) ?? 'Package' : 'No pay package'}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-[44px] w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <LoadingButton loading={busy} disabled={busy} onClick={apply} className="min-h-[44px] w-full gradient-gold text-primary-foreground sm:w-auto">Apply to {picked.size || ''} driver{picked.size === 1 ? '' : 's'}</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
