import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Calendar, MapPin, Lock, DollarSign, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { TimeTypeBadge } from '@/components/shared/TimeTypeBadge';

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

function getCondensedAddress(address: string): string {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/\b([A-Z]{2})\b/);
    if (m) {
      const state = m[1];
      const city = i > 0 ? parts[i - 1] : '';
      return city ? `${city}, ${state}` : state;
    }
  }
  return parts[0] || address;
}

function estimatePay(load: Load, payRate?: number | null, payType?: string | null): number | null {
  if (!payRate || !payType) return null;
  if (payType === 'percentage' && load.rate) {
    return load.rate * (payRate / 100);
  }
  if (payType === 'per_mile' && load.booked_miles) {
    return load.booked_miles * payRate;
  }
  return null;
}

export function NextLoadPreview({ load, payRate, payType }: NextLoadPreviewProps) {
  const estPay = estimatePay(load, payRate, payType);

  return (
    <Card className="bg-muted/30 border-dashed opacity-95">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Up Next (Pre-Plan)
          </p>
          <Badge variant="outline" className="font-mono text-xs">
            {load.landstar_load_id || 'Pending'}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Starts after your current load is delivered
        </p>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate" title={load.origin}>{getCondensedAddress(load.origin)}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate" title={load.destination}>{getCondensedAddress(load.destination)}</span>
        </div>

        {load.pickup_number && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-md border-2 border-warning bg-warning/15 px-2.5 py-1 text-warning font-bold tracking-wide shadow-sm">
            <FileText className="h-3.5 w-3.5" />
            <span className="text-[11px] uppercase">Pickup #:</span>
            <span className="font-mono text-sm">{load.pickup_number}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {load.pickup_date
              ? format(parseISO(`${load.pickup_date}T00:00:00`), 'EEE, MMM d')
              : 'Date TBD'}
            {load.pickup_time && (
              <TimeTypeBadge timeType={load.pickup_time_type} time={load.pickup_time} endTime={load.pickup_end_time} variant="compact" />
            )}
          </div>
          <div className="flex items-center gap-3">
            {load.booked_miles && (
              <span>{load.booked_miles.toLocaleString()} mi</span>
            )}
            {estPay != null && (
              <span className="flex items-center gap-0.5 font-medium text-foreground">
                <DollarSign className="h-3 w-3" />
                {estPay.toLocaleString(undefined, { maximumFractionDigits: 0 })} est.
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
