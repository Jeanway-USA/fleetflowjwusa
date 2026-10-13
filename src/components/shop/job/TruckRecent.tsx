import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { jobTitle, money } from '@/lib/shop/board';

/** The last few jobs finished on this truck, so whoever picks it up knows what was just done. */
export function TruckRecent({ truckId, excludeId }: { truckId: string; excludeId: string }) {
  const { data = [] } = useQuery({
    queryKey: ['shop', 'truck-recent', truckId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('work_orders')
        .select('id, service_type, service_types, entry_date, completed_at, final_cost, odometer_reading, notes')
        .eq('truck_id', truckId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('completed_at', { ascending: false })
        .limit(6);
      return (rows ?? []).filter((r) => r.id !== excludeId).slice(0, 5);
    },
  });
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No finished jobs on this truck yet.</p>;
  return (
    <ul className="divide-y">
      {data.map((r) => (
        <li key={r.id} className="py-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{jobTitle({ serviceType: r.service_type ?? '', serviceTypes: r.service_types ?? [] })}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{format(parseISO(r.completed_at ? r.completed_at.slice(0, 10) : r.entry_date), 'MMM d, yyyy')}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {[r.odometer_reading ? `${r.odometer_reading.toLocaleString()} mi` : null, r.final_cost ? money(Number(r.final_cost)) : null].filter(Boolean).join(' · ')}
          </p>
          {r.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.notes}</p>}
        </li>
      ))}
    </ul>
  );
}
