import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck } from 'lucide-react';

interface FleetStatus {
  active: number;      // Trucks currently on loads
  available: number;   // Active trucks not on loads
  maintenance: number; // In maintenance
  outOfService: number;// Out of service
  total: number;
}

interface FleetStatusCardProps {
  data?: FleetStatus;
  isLoading?: boolean;
}

const statusConfig = [
  { key: 'active', label: 'Hauling', color: 'bg-green-500' },
  { key: 'available', label: 'Available', color: 'bg-primary' },
  { key: 'maintenance', label: 'Maintenance', color: 'bg-yellow-500' },
  { key: 'outOfService', label: 'Out of Service', color: 'bg-destructive' },
] as const;

export function FleetStatusCard({ data, isLoading }: FleetStatusCardProps) {
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            Fleet Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const utilizationRate = data.total > 0 ? ((data.active + data.available) / data.total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            Fleet Status
          </span>
          <span className="text-xs text-muted-foreground font-normal">
            {data.total} trucks
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked Bar */}
        <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
          {statusConfig.map(({ key, color }) => {
            const value = data[key as keyof FleetStatus] as number;
            const percentage = data.total > 0 ? (value / data.total) * 100 : 0;
            if (percentage === 0) return null;
            return (
              <div
                key={key}
                className={`${color} transition-all duration-500`}
                style={{ width: `${percentage}%` }}
              />
            );
          })}
        </div>

        {/* Legend with counts */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {statusConfig.map(({ key, label, color }) => {
            const value = data[key as keyof FleetStatus] as number;
            return (
              <div key={key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-muted-foreground">{label}</span>
                </div>
                <span className="font-medium">{value}</span>
              </div>
            );
          })}
        </div>

        {/* Quick stat */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Revenue-Ready</span>
            <span className={`font-semibold ${utilizationRate >= 80 ? 'text-green-500' : utilizationRate >= 60 ? 'text-primary' : 'text-yellow-500'}`}>
              {data.active + data.available} of {data.total} ({utilizationRate.toFixed(0)}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
