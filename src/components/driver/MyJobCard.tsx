import { todayLocal } from '@/lib/datetime';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Check, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePersonPositions, usePositions } from '@/hooks/usePositions';
import { useDriverAssignments, usePayPackages } from '@/hooks/usePayPackages';
import { assignmentOn } from '@/lib/pay-packages/resolve';
import { formatDate } from '@/lib/formatters';

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

  return (
    <details className="rounded-lg border bg-card p-3 text-sm" open={open && steps.length > 0}>
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 font-medium">
        <Briefcase className="h-4 w-4 text-primary" />
        My job{position ? `: ${position.name}` : ''}
        {steps.length > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">{steps.filter((s) => progress[s.id]).length} of {steps.length} steps done</span>}
      </summary>
      <div className="space-y-3 pt-2">
        {current && position && <p className="text-xs text-muted-foreground">Since {formatDate(current.effective_start)}</p>}
        {pkg && <p>Pay package: <strong>{pkg.name}</strong></p>}
        {steps.length > 0 && (
          <ul className="space-y-1">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                {progress[s.id] ? <Check className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className={progress[s.id] ? 'text-muted-foreground line-through' : ''}>{s.label}</span>
              </li>
            ))}
          </ul>
        )}
        {position && position.required_documents.length > 0 && (
          <ul className="space-y-1">
            {position.required_documents.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                {signed.includes(d.key) ? <Check className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span>{d.label}</span>
                {!signed.includes(d.key) && <span className="text-xs text-muted-foreground">to sign</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
