import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, MapPin, Package, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useContactRevenueStats } from '@/hooks/useCRMData';

interface ContactRevenueStatsProps {
  contactId: string;
}

export function ContactRevenueStats({ contactId }: ContactRevenueStatsProps) {
  const { data: stats, isLoading } = useContactRevenueStats(contactId);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Loading revenue data...</div>;
  }

  if (!stats || stats.loadCount === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No linked loads yet.</p>;
  }

  const metrics = [
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: DollarSign },
    { label: 'Total Miles', value: stats.totalMiles.toLocaleString(), icon: MapPin },
    { label: 'Load Count', value: stats.loadCount.toString(), icon: Package },
    { label: 'Avg $/Mile', value: `$${stats.avgRatePerMile.toFixed(2)}`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <Card key={m.label} className="border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <m.icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-semibold">{m.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.monthlyRevenue.some((m) => m.revenue > 0) && (
        <Card className="border-border">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Revenue (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={stats.monthlyRevenue}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
