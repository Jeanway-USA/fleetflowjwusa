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
    label: 'Gross',
    color: 'hsl(var(--foreground))',
  },
  netRevenue: {
    label: 'Truck revenue',
    color: 'hsl(var(--primary))',
  },
  operatingCosts: {
    label: 'Expenses',
    color: 'hsl(var(--destructive))',
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
        <CardTitle className="text-xl font-bold">Last six months</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} className="stroke-border" />
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
              type="linear"
              dataKey="grossRevenue"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--foreground))" }}
              activeDot={{ r: 4 }}
              fill="none"
            />
            <Area
              type="linear"
              dataKey="netRevenue"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
              activeDot={{ r: 4 }}
              fill="none"
            />
            <Area
              type="linear"
              dataKey="operatingCosts"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--destructive))" }}
              activeDot={{ r: 4 }}
              fill="none"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
