import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DriverMetric } from '@/hooks/useDriverPerformanceData';
import { EmptyState } from '@/components/shared/EmptyState';
import { BarChart3 } from 'lucide-react';

interface PerformanceChartsProps {
  metrics: DriverMetric[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function PerformanceCharts({ metrics }: PerformanceChartsProps) {
  const chartData = metrics.slice(0, 5).map(m => ({
    name: `${m.driver.first_name} ${m.driver.last_name.charAt(0)}.`,
    score: Math.round(m.overallScore),
    revenue: m.totalRevenue,
    loads: m.totalLoads,
    mpg: m.mpg !== null ? Number(m.mpg.toFixed(1)) : 0,
  }));

  if (chartData.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No chart data available"
        description="Performance charts will appear here once drivers have delivered loads in the selected period."
      />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Top 5 — Overall Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Top 5 — Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated md:col-span-2">
        <CardHeader>
          <CardTitle>Top 5 — Fuel Efficiency (MPG)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 'auto']} />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip formatter={(value: number) => `${value} MPG`} />
                <Bar dataKey="mpg" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
