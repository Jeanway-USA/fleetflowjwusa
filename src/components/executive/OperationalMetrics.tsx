import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, MapPin, DollarSign, Truck, Clock } from 'lucide-react';

interface OperationalData {
  totalLoads: number;
  totalMiles: number;
  revenuePerMile: number;
  fleetUtilization: number;
  onTimeRate: number;
  totalEmptyMiles?: number;
  emptyMilesRatio?: number;
}

interface OperationalMetricsProps {
  data: OperationalData | undefined;
  isLoading: boolean;
}

function MetricRow({
  icon: Icon,
  label,
  value,
  suffix = '',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="font-semibold">
        {value}
        {suffix}
      </span>
    </div>
  );
}

export function OperationalMetrics({ data, isLoading }: OperationalMetricsProps) {
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(Math.round(num));
  const formatCurrency = (num: number) => `$${num.toFixed(2)}`;
  const formatPercent = (num: number) => `${num.toFixed(1)}%`;

  return (
    <Card className="border-border h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Operational Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <MetricRow icon={Package} label="Loads Completed" value={formatNumber(data?.totalLoads ?? 0)} />
        <MetricRow icon={MapPin} label="Miles Driven" value={formatNumber(data?.totalMiles ?? 0)} suffix=" mi" />
        <MetricRow icon={DollarSign} label="Revenue per Mile" value={formatCurrency(data?.revenuePerMile ?? 0)} />
        <MetricRow icon={Truck} label="Fleet Utilization" value={formatPercent(data?.fleetUtilization ?? 0)} />
        <MetricRow icon={Clock} label="On-Time Delivery" value={formatPercent(data?.onTimeRate ?? 0)} />
        <MetricRow icon={MapPin} label="Empty Miles" value={formatNumber(data?.totalEmptyMiles ?? 0)} suffix=" mi" />
        <MetricRow icon={Truck} label="Empty Miles Ratio" value={formatPercent(data?.emptyMilesRatio ?? 0)} />
      </CardContent>
    </Card>
  );
}
