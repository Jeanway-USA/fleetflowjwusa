import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Calendar, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Load {
  id: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  status: string;
  booked_miles: number | null;
  landstar_load_id: string | null;
}

interface NextLoadPreviewProps {
  load: Load;
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

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{load.origin}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{load.destination}</span>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {load.pickup_date 
              ? format(parseISO(load.pickup_date), 'EEE, MMM d')
              : 'Date TBD'
            }
          </div>
          {load.booked_miles && (
            <span>{load.booked_miles.toLocaleString()} mi</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
