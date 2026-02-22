import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Package, Truck, Users, FileText } from 'lucide-react';
import { format } from 'date-fns';

export function EngagementTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-usage-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_admin_usage_metrics' as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const totalLoads = (data?.total_fleet_loads ?? 0) + (data?.total_agency_loads ?? 0);
  const fleetSize = (data?.total_trucks ?? 0) + (data?.total_trailers ?? 0);
  const chartData = (data?.loads_per_day_30d ?? []).map((d: any) => ({
    day: format(new Date(d.day), 'MMM d'),
    count: d.count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Loads Processed" value={totalLoads} loading={isLoading} icon={<Package className="h-5 w-5" />} />
        <MetricCard title="Active Fleet Size" value={fleetSize} loading={isLoading} icon={<Truck className="h-5 w-5" />} />
        <MetricCard title="System-Wide Drivers" value={data?.total_drivers ?? 0} loading={isLoading} icon={<Users className="h-5 w-5" />} />
        <MetricCard title="Total Agency Loads" value={data?.total_agency_loads ?? 0} loading={isLoading} icon={<FileText className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loads Created — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No load activity in the last 30 days</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, loading, icon }: { title: string; value: number; loading: boolean; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-3xl font-bold">{value}</p>}
      </CardContent>
    </Card>
  );
}
