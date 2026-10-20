import { ArrowRight } from 'lucide-react';
import { appointmentText, condensedAddress, shortDate } from '@/lib/driver/load';
import { Panel, PanelHead, Stat, StatCell, StatRow } from '@/components/driver/ui/driver-ui';

interface Load {
  id: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  pickup_time?: string | null;
  pickup_end_time?: string | null;
  pickup_time_type?: string | null;
  status: string;
  booked_miles: number | null;
  landstar_load_id: string | null;
  rate?: number | null;
  pickup_number?: string | null;
}

interface NextLoadPreviewProps {
  load: Load;
  payRate?: number | null;
  payType?: string | null;
}

function estimatePay(load: Load, payRate?: number | null, payType?: string | null): number | null {
  if (!payRate || !payType) return null;
  if (payType === 'percentage' && load.rate) return load.rate * (payRate / 100);
  if (payType === 'per_mile' && load.booked_miles) return load.booked_miles * payRate;
  return null;
}

/** The load after this one, planned ahead: where from and to, when it starts, how far, and what it should pay. */
export function NextLoadPreview({ load, payRate, payType }: NextLoadPreviewProps) {
  const estPay = estimatePay(load, payRate, payType);
  const appt = appointmentText(load.pickup_time_type, load.pickup_time, load.pickup_end_time);
  return (
    <Panel>
      <PanelHead title="Up next" aside={<span className="font-mono text-xs">{load.landstar_load_id || 'Pending'}</span>} />
      <div className="px-4 pb-4">
        <p className="flex flex-wrap items-center gap-x-2 font-condensed text-2xl font-bold leading-tight">
          <span title={load.origin}>{condensedAddress(load.origin)}</span>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="to" />
          <span title={load.destination}>{condensedAddress(load.destination)}</span>
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Starts {shortDate(load.pickup_date) ?? 'on a date still to be set'}
          {appt ? `, ${appt.text.toLowerCase()}` : ''}
        </p>
        {load.pickup_number && (
          <div className="mt-3 rounded-lg bg-carbon/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">Pickup number</p>
            <p className="font-mono text-lg font-semibold tabular-nums">{load.pickup_number}</p>
          </div>
        )}
      </div>
      <StatRow>
        <StatCell><Stat label="Miles">{load.booked_miles ? load.booked_miles.toLocaleString() : '-'}</Stat></StatCell>
        <StatCell><Stat label="Est. pay">{estPay != null ? `$${estPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '-'}</Stat></StatCell>
      </StatRow>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Starts after your current load is delivered.</p>
    </Panel>
  );
}
