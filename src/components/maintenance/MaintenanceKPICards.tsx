import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useFleetAvailability, 
  useMaintenanceCostMTD, 
  useCostPerMile, 
  useComplianceAlerts 
} from '@/hooks/useMaintenanceData';
import { Truck, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';

export function MaintenanceKPICards() {
  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <FleetAvailabilityCard />
      <MaintenanceCostCard />
      <CostPerMileCard />
      <ComplianceAlertCard />
    </div>
  );
}

function FleetAvailabilityCard() {
  const { data, isLoading } = useFleetAvailability();

  const chartData = data ? [
    { name: 'Available', value: data.available, color: 'hsl(var(--chart-2))' },
    { name: 'In Shop', value: data.inShop, color: 'hsl(var(--chart-1))' },
  ] : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Fleet Availability</CardTitle>
        <Truck className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[100px] w-full" />
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-[80px] w-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={35}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm">Available: <strong>{data?.available || 0}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-sm">In Shop: <strong>{data?.inShop || 0}</strong></span>
              </div>
              <p className="text-xs text-muted-foreground">
                Total: {data?.total || 0} trucks
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaintenanceCostCard() {
  const { data, isLoading } = useMaintenanceCostMTD();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Maintenance Cost (MTD)</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-[120px]" />
        ) : (
          <>
            <div className="text-2xl font-bold">
              ${(data || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              Current month total
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CostPerMileCard() {
  const { data, isLoading } = useCostPerMile();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Cost Per Mile (CPM)</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-[80px]" />
        ) : (
          <>
            <div className="text-2xl font-bold">
              ${(data || 0).toFixed(3)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per mile driven
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceAlertCard() {
  const { data, isLoading } = useComplianceAlerts();
  const hasAlerts = (data?.count || 0) > 0;

  return (
    <Card className={cn(
      hasAlerts && 'border-red-300 bg-red-50/50 dark:bg-red-950/20'
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Compliance Alerts</CardTitle>
        <AlertTriangle className={cn(
          'h-4 w-4',
          hasAlerts ? 'text-red-500' : 'text-muted-foreground'
        )} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-[40px]" />
        ) : (
          <>
            <div className={cn(
              'text-2xl font-bold',
              hasAlerts && 'text-red-600'
            )}>
              {data?.count || 0}
            </div>
            <p className={cn(
              'text-xs',
              hasAlerts ? 'text-red-600' : 'text-muted-foreground'
            )}>
              {hasAlerts 
                ? '120-Day inspections due soon' 
                : 'All inspections up to date'}
            </p>
            {hasAlerts && data?.trucks && (
              <div className="mt-2 space-y-1">
                {data.trucks.slice(0, 3).map(truck => (
                  <p key={truck.truckId} className="text-xs text-red-600">
                    {truck.unitNumber}: {truck.neverInspected 
                      ? 'Never Inspected'
                      : truck.daysRemaining !== null && truck.daysRemaining < 0 
                        ? `Overdue ${Math.abs(truck.daysRemaining)}d` 
                        : `${truck.daysRemaining}d left`}
                  </p>
                ))}
                {data.trucks.length > 3 && (
                  <p className="text-xs text-red-600">
                    +{data.trucks.length - 3} more
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
