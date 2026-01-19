import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { Area, AreaChart, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';

interface TrendDataPoint {
  period: string;
  grossRevenue: number;
  netRevenue: number;
  operatingCosts: number;
}

interface RevenueTrendsChartProps {
  data: TrendDataPoint[];
  isLoading: boolean;
}

const chartConfig = {
  grossRevenue: {
    label: 'Gross Revenue',
    color: 'hsl(45 80% 50%)',
  },
  netRevenue: {
    label: 'Net Revenue',
    color: 'hsl(142 70% 45%)',
  },
  operatingCosts: {
    label: 'Operating Costs',
    color: 'hsl(0 70% 50%)',
  },
};

export function RevenueTrendsChart({ data, isLoading }: RevenueTrendsChartProps) {
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Revenue Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="grossRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(45 80% 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(45 80% 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="netRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142 70% 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142 70% 45%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="operatingCostsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0 70% 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(0 70% 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
              className="text-muted-foreground"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 0,
                    }).format(value as number)
                  }
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="grossRevenue"
              stroke="hsl(45 80% 50%)"
              strokeWidth={2}
              fill="url(#grossRevenueGradient)"
            />
            <Area
              type="monotone"
              dataKey="netRevenue"
              stroke="hsl(142 70% 45%)"
              strokeWidth={2}
              fill="url(#netRevenueGradient)"
            />
            <Area
              type="monotone"
              dataKey="operatingCosts"
              stroke="hsl(0 70% 50%)"
              strokeWidth={2}
              fill="url(#operatingCostsGradient)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
