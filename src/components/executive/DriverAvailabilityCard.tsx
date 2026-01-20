import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';

interface DriverAvailability {
  onLoad: number;       // Currently assigned and hauling
  available: number;    // Active, not on a load
  offDuty: number;      // Off duty / inactive
  credentialIssues: number; // Expired license/medical
  total: number;
}

interface DriverAvailabilityCardProps {
  data?: DriverAvailability;
  isLoading?: boolean;
}

const statusConfig = [
  { key: 'onLoad', label: 'On Load', color: 'bg-green-500' },
  { key: 'available', label: 'Available', color: 'bg-primary' },
  { key: 'offDuty', label: 'Off Duty', color: 'bg-muted-foreground' },
  { key: 'credentialIssues', label: 'Credential Issues', color: 'bg-destructive' },
] as const;

export function DriverAvailabilityCard({ data, isLoading }: DriverAvailabilityCardProps) {
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Driver Availability
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const activeDrivers = data.onLoad + data.available;
  const activeRate = data.total > 0 ? (activeDrivers / data.total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Driver Availability
          </span>
          <span className="text-xs text-muted-foreground font-normal">
            {data.total} drivers
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked Bar */}
        <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
          {statusConfig.map(({ key, color }) => {
            const value = data[key as keyof DriverAvailability] as number;
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
            const value = data[key as keyof DriverAvailability] as number;
            return (
              <div key={key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-muted-foreground">{label}</span>
                </div>
                <span className={`font-medium ${key === 'credentialIssues' && value > 0 ? 'text-destructive' : ''}`}>
                  {value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Quick stat */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Active Drivers</span>
            <span className={`font-semibold ${activeRate >= 80 ? 'text-green-500' : activeRate >= 60 ? 'text-primary' : 'text-yellow-500'}`}>
              {activeDrivers} of {data.total} ({activeRate.toFixed(0)}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
