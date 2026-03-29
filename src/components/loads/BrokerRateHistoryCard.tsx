import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface BrokerRateHistoryCardProps {
  agencyCode: string;
  currentLoads: any[];
}

export function BrokerRateHistoryCard({ agencyCode, currentLoads }: BrokerRateHistoryCardProps) {
  const stats = useMemo(() => {
    const brokerLoads = currentLoads.filter(
      (l: any) => l.agency_code === agencyCode && l.status === 'delivered'
    );
    if (brokerLoads.length === 0) return null;

    const totalRevenue = brokerLoads.reduce((sum: number, l: any) => sum + (l.gross_revenue || 0), 0);
    const totalMiles = brokerLoads.reduce((sum: number, l: any) => sum + (l.booked_miles || 0), 0);
    const avgRatePerMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

    return { avgRatePerMile, loadCount: brokerLoads.length };
  }, [agencyCode, currentLoads]);

  if (!stats) return null;

  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <TrendingUp className="h-4 w-4 text-primary shrink-0" />
        <div className="text-sm">
          <span className="font-medium text-foreground">Broker Rate History</span>
          <span className="text-muted-foreground ml-2">
            Avg ${stats.avgRatePerMile.toFixed(2)}/mi across {stats.loadCount} delivered load{stats.loadCount !== 1 ? 's' : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
