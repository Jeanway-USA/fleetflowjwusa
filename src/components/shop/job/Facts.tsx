import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useShopActions, useShopCrew, type ShopJobDetail } from '@/hooks/useShop';
import { PRIORITY_LABEL, type Priority } from '@/lib/shop/board';
import { TruckStatusControl } from '@/components/shop/job/TruckStatus';

const NONE = '__none__';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** The office's controls for a job: who is on it, how urgent, which bay, and the odometer. */
export function Facts({ detail }: { detail: ShopJobDetail }) {
  const actions = useShopActions();
  const { data: crew = [] } = useShopCrew();
  const { job } = detail;
  const locked = job.status === 'completed';
  const [bay, setBay] = useState(job.bay ?? '');
  const [odo, setOdo] = useState(job.odometer ? String(job.odometer) : '');
  useEffect(() => setBay(job.bay ?? ''), [job.bay]);
  useEffect(() => setOdo(job.odometer ? String(job.odometer) : ''), [job.odometer]);

  const err = (e: any) => toast.error(e.message);

  return (
    <div className="space-y-4">
      <Field label="Who is on it">
        <Select
          disabled={locked}
          value={job.assignedTo ?? NONE}
          onValueChange={(v) => {
            const person = crew.find((c) => c.id === v);
            actions.assign.mutate({ id: job.id, userId: person?.id ?? null, name: person?.name ?? null }, { onError: err });
          }}
        >
          <SelectTrigger className="h-11"><SelectValue placeholder={job.assignedName ?? 'Nobody yet'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nobody yet</SelectItem>
            {crew.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select disabled={locked} value={job.priority} onValueChange={(v) => actions.setPriority.mutate({ id: job.id, priority: v as Priority }, { onError: err })}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['low', 'normal', 'high', 'critical'] as Priority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Bay">
          <Input disabled={locked} value={bay} onChange={(e) => setBay(e.target.value)} onBlur={() => bay !== (job.bay ?? '') && actions.setBay.mutate({ id: job.id, bay: bay.trim() || null }, { onError: err })} placeholder="e.g. 2" className="h-11" />
        </Field>
      </div>

      <Field label="Truck status">
        <TruckStatusControl truckId={job.truckId} status={detail.raw?.trucks?.status} />
      </Field>

      <Field label="Odometer (miles)">
        <Input disabled={locked} inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => odo && Number(odo) !== job.odometer && actions.updateOdometer.mutate({ id: job.id, miles: Number(odo) }, { onError: err })} placeholder="Enter when the truck comes in" className="h-11" />
      </Field>
    </div>
  );
}
