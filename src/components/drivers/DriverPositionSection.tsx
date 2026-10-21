import { todayLocal } from '@/lib/datetime';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Briefcase, Check, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared/FormParts';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isMissingTables, usePayPackages } from '@/hooks/usePayPackages';
import { useAreaLimit, useAssignPosition, useChecklistItem, usePersonPositions, usePositions, useSetAreaLimit } from '@/hooks/usePositions';
import { suggestFromPosition } from '@/lib/positions/defaults';
import { APP_ROLE_LABELS, PERMISSION_AREAS, type AppRoleKey } from '@/lib/positions/types';
import { formatDate } from '@/lib/formatters';

const today = () => todayLocal();
const areaLabel = (k: string) => PERMISSION_AREAS.find((a) => a.key === k)?.label ?? k;

interface Props {
  /** The driver record, when the person is a driver. */
  driver?: { id: string; user_id?: string | null } | null;
  /** The sign-in account, when the person is staff (or a driver with an account). */
  userId?: string | null;
  /** Called when choosing a position suggests a pay package, so the pay package form can pre-fill it. */
  onSuggestPackage: (packageId: string | null) => void;
}

/**
 * The position a person holds, for a driver or for staff. Choosing one suggests its pay package (still fully
 * editable), shows its documents and onboarding steps, and can limit the person to the position's areas.
 */
export function DriverPositionSection({ driver, userId: userIdProp, onSuggestPackage }: Props) {
  const { hasPayrollAccess } = useAuth();
  const driverId = driver?.id ?? null;
  const userId = userIdProp ?? driver?.user_id ?? null;
  const { data: positions = [], error } = usePositions();
  const { data: assignments = [] } = usePersonPositions({ driverId, userId: driverId ? null : userId });
  const { data: packages = [] } = usePayPackages();
  const { data: limit } = useAreaLimit(userId);
  const assign = useAssignPosition();
  const tick = useChecklistItem();
  const setLimit = useSetAreaLimit();
  const [choice, setChoice] = useState('');
  const [start, setStart] = useState(today());
  const [note, setNote] = useState('');

  const current = assignments.find((a) => !a.effective_end) ?? null;
  const currentPosition = positions.find((p) => p.id === current?.position_id) ?? null;
  const chosen = positions.find((p) => p.id === choice) ?? null;
  const shown = chosen ?? currentPosition;

  const { data: signed = [] } = useQuery({
    queryKey: ['positions', 'signed-documents', driverId],
    enabled: !!driverId && !!shown && shown.required_documents.length > 0,
    queryFn: async () => {
      const { data, error: e } = await supabase.from('driver_signed_documents').select('document_type').eq('driver_id', driverId!);
      if (e) throw e;
      return (data ?? []).map((d) => d.document_type as string);
    },
  });

  const usablePackages = useMemo(() => new Set(packages.filter((p) => !p.archived_at && p.is_active).map((p) => p.id)), [packages]);
  const suggestion = shown ? suggestFromPosition(shown, usablePackages) : null;

  if (error && isMissingTables(error)) return null;
  if (!hasPayrollAccess && !current) return null;

  const pick = (id: string) => {
    setChoice(id);
    const p = positions.find((x) => x.id === id);
    onSuggestPackage(p ? suggestFromPosition(p, usablePackages).payPackageId : null);
  };

  const submit = async () => {
    if (!choice) return toast.error('Choose a position.');
    try {
      await assign.mutateAsync({ positionId: choice, driverId, userId: driverId ? null : userId, start, note: note.trim() || undefined });
      toast.success('Position set. Assign the suggested pay package below if it is right.');
      setChoice('');
      setNote('');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not set the position');
    }
  };

  const limited = !!limit?.is_active;
  const toggleLimit = async (on: boolean) => {
    if (!userId) return;
    try {
      await setLimit.mutateAsync({ userId, areas: on ? currentPosition?.default_permissions ?? [] : limit?.areas ?? [], active: on, positionId: currentPosition?.id ?? null });
      toast.success(on ? 'Limited to this position\'s areas.' : 'Limit lifted. Their role decides what they can open.');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not change the limit');
    }
  };

  const progress = current?.checklist_progress ?? {};
  const steps = currentPosition?.onboarding_checklist ?? [];
  const doneCount = steps.filter((s) => progress[s.id]).length;

  return (
    <>
      <Separator />
      <div className="space-y-3 py-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-medium">Position</h4>
        </div>

        {current && currentPosition ? (
          <p className="text-sm">
            <span className="font-medium">{currentPosition.name}</span>
            <span className="text-muted-foreground"> · since {formatDate(current.effective_start)}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No position set.</p>
        )}

        {hasPayrollAccess && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Position">
                <Select value={choice} onValueChange={pick}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Choose a position" /></SelectTrigger>
                  <SelectContent>
                    {positions.filter((p) => !p.archived_at).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Takes effect"><Input type="date" className="h-11" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            </div>
            <Input className="h-11" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <LoadingButton loading={assign.isPending} disabled={assign.isPending || !choice} onClick={submit} className="min-h-[44px] w-full sm:w-auto">
              {current ? 'Change position' : 'Set position'}
            </LoadingButton>
          </div>
        )}

        {chosen && suggestion && (
          <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <p className="font-medium text-foreground">{chosen.name} suggests:</p>
            <p>
              Pay package:{' '}
              {suggestion.payPackageId ? <strong>{packages.find((p) => p.id === suggestion.payPackageId)?.name}</strong> : 'none linked (pick one below)'}
              {suggestion.payPackageId && ' (already chosen below, change it if needed)'}
            </p>
            {suggestion.role && <p>Account role: {APP_ROLE_LABELS[suggestion.role as AppRoleKey]}</p>}
            {suggestion.permissions.length > 0 && <p>Areas: {suggestion.permissions.map(areaLabel).join(', ')}</p>}
          </div>
        )}

        {hasPayrollAccess && userId && currentPosition && !chosen && (
          <div className="space-y-1 rounded-lg border p-3">
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <Switch checked={limited} disabled={setLimit.isPending} onCheckedChange={toggleLimit} />
              <span>
                Limit to this position's areas
                <span className="block text-xs text-muted-foreground">
                  {limited
                    ? `Can only open: ${(limit?.areas ?? []).map(areaLabel).join(', ') || 'nothing'}. Their role can still only allow less, never more.`
                    : 'Off: their role alone decides what they can open.'}
                </span>
              </span>
            </label>
          </div>
        )}

        {currentPosition && !chosen && currentPosition.required_documents.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Required documents</p>
            <ul className="space-y-1 text-sm">
              {currentPosition.required_documents.map((d) => {
                const done = signed.includes(d.key);
                return (
                  <li key={d.key} className="flex items-center gap-2">
                    {done ? <Check className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className={done ? '' : 'text-muted-foreground'}>{d.label}</span>
                    {driverId && !done && <Badge variant="outline" className="text-xs">Not signed</Badge>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {current && currentPosition && steps.length > 0 && !chosen && (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Onboarding checklist · {doneCount} of {steps.length}</p>
            <ul>
              {steps.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!progress[s.id]}
                      disabled={!hasPayrollAccess || tick.isPending}
                      onCheckedChange={(v) => tick.mutate({ assignmentId: current.id, itemId: s.id, done: v === true }, { onError: (e: any) => toast.error(e.message ?? 'Could not update the checklist') })}
                    />
                    <span className={progress[s.id] ? 'text-muted-foreground line-through' : ''}>{s.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
