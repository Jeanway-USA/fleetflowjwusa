import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

interface CostCategory {
  name: string;
  value: number;
  color: string;
}

interface CostBreakdownChartProps {
  data: CostCategory[];
  isLoading: boolean;
}

const chartConfig = {
  fuel: { label: 'Fuel', color: 'hsl(45 80% 50%)' },
  payments: { label: 'Payments', color: 'hsl(200 70% 50%)' },
  insurance: { label: 'Insurance', color: 'hsl(280 70% 50%)' },
  maintenance: { label: 'Maintenance', color: 'hsl(142 70% 45%)' },
  payroll: { label: 'Payroll', color: 'hsl(0 70% 50%)' },
  other: { label: 'Other', color: 'hsl(0 0% 50%)' },
};

export function CostBreakdownChart({ data, isLoading }: CostBreakdownChartProps) {
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          <Skeleton className="h-[250px] w-[250px] rounded-full" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card className="border-border h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatCurrency(value as number)}
                />
              }
            />
            <Legend
              formatter={(value, entry: any) => (
                <span className="text-sm text-foreground">{entry.payload.name}</span>
              )}
            />
          </PieChart>
        </ChartContainer>
        <div className="mt-4 text-center">
          <span className="text-sm text-muted-foreground">Total: </span>
          <span className="font-semibold">{formatCurrency(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
