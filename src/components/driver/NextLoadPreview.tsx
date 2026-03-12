import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Calendar, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { TimeTypeBadge } from '@/components/shared/TimeTypeBadge';

interface Load {
  id: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  pickup_time?: string | null;
  pickup_time_type?: string | null;
  status: string;
  booked_miles: number | null;
  landstar_load_id: string | null;
}

interface NextLoadPreviewProps {
  load: Load;
}

function getCondensedAddress(address: string): string {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);

  // Find state abbreviation pattern
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/\b([A-Z]{2})\b/);
    if (m) {
      const state = m[1];
      // city is usually the part right before the state/zip chunk
      const city = i > 0 ? parts[i - 1] : '';
      return city ? `${city}, ${state}` : state;
    }
  }

  // Fallback: use first part
  return parts[0] || address;
}

export function NextLoadPreview({ load }: NextLoadPreviewProps) {
  return (
    <Card className="bg-muted/30 border-dashed">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Next Assignment
          </p>
          <Badge variant="outline" className="font-mono text-xs">
            {load.landstar_load_id || 'Pending'}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate" title={load.origin}>{getCondensedAddress(load.origin)}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate" title={load.destination}>{getCondensedAddress(load.destination)}</span>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {load.pickup_date 
              ? format(parseISO(load.pickup_date), 'EEE, MMM d')
              : 'Date TBD'
            }
            {load.pickup_time && (
              <TimeTypeBadge timeType={load.pickup_time_type} time={load.pickup_time} variant="compact" />
            )}
          </div>
          {load.booked_miles && (
            <span>{load.booked_miles.toLocaleString()} mi</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
