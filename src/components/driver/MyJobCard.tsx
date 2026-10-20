import { todayLocal } from '@/lib/datetime';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePersonPositions, usePositions } from '@/hooks/usePositions';
import { useDriverAssignments, usePayPackages } from '@/hooks/usePayPackages';
import { assignmentOn } from '@/lib/pay-packages/resolve';
import { formatDate } from '@/lib/formatters';
import { Panel } from '@/components/driver/ui/driver-ui';

/**
 * A driver's own position, onboarding checklist and the name of their pay package. The database only returns the
 * driver's own rows, so nothing here can show anyone else's. Renders nothing until something has been assigned.
 */
export function MyJobCard({ driverId }: { driverId: string }) {
  const { data: assignments = [] } = usePersonPositions({ driverId });
  const { data: positions = [] } = usePositions();
  const { data: pay = [] } = useDriverAssignments(driverId);
  const { data: packages = [] } = usePayPackages();

  const current = assignments.find((a) => !a.effective_end) ?? null;
  const position = positions.find((p) => p.id === current?.position_id) ?? null;
  const today = todayLocal();
  const payNow = assignmentOn(pay, today);
  const pkg = packages.find((p) => p.id === payNow?.package_id) ?? null;

  const { data: signed = [] } = useQuery({
    queryKey: ['my-job', 'signed', driverId],
    enabled: !!position && position.required_documents.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('driver_signed_documents').select('document_type').eq('driver_id', driverId);
      if (error) throw error;
      return (data ?? []).map((d) => d.document_type as string);
    },
  });

  if (!position && !pkg) return null;
  const steps = position?.onboarding_checklist ?? [];
  const progress = current?.checklist_progress ?? {};
  const open = steps.some((s) => !progress[s.id]);
  const docs = position?.required_documents ?? [];
  const doneCount = steps.filter((s) => progress[s.id]).length;

  const item = (key: string, done: boolean, label: string, note?: string) => (
    <li key={key} className="flex min-h-11 items-center gap-3">
      {done ? <Check className="h-4 w-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className={done ? 'text-sm text-muted-foreground line-through' : 'text-sm'}>{label}</span>
      {note && !done && <span className="ml-auto text-xs text-muted-foreground">{note}</span>}
    </li>
  );

  return (
    <Panel>
      <details open={open && steps.length > 0} className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">My job{position ? `: ${position.name}` : ''}</span>
            {steps.length > 0 && <span className="block text-xs text-muted-foreground">{doneCount} of {steps.length} steps done</span>}
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t border-border px-4 py-3">
          {(current && position) || pkg ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {current && position && <div><p className="text-xs text-muted-foreground">Since</p><p className="mt-0.5 font-medium tabular-nums">{formatDate(current.effective_start)}</p></div>}
              {pkg && <div><p className="text-xs text-muted-foreground">Pay package</p><p className="mt-0.5 font-medium">{pkg.name}</p></div>}
            </div>
          ) : null}
          {(steps.length > 0 || docs.length > 0) && (
            <ul>
              {steps.map((s) => item(`s-${s.id}`, !!progress[s.id], s.label))}
              {docs.map((d) => item(`d-${d.key}`, signed.includes(d.key), d.label, 'to sign'))}
            </ul>
          )}
        </div>
      </details>
    </Panel>
  );
}
