import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

interface IncidentTrendsChartProps {
  data: Array<{ month: string; total: number; critical: number }>;
  config: ChartConfig;
}

export function IncidentTrendsChart({ data, config }: IncidentTrendsChartProps) {
  return (
    <ChartContainer config={config} className="h-[200px]">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" />
        <YAxis allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="critical" fill="var(--color-critical)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
