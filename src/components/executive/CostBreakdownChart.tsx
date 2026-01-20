import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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
  value: { label: 'Amount' },
};

export function CostBreakdownChart({ data, isLoading }: CostBreakdownChartProps) {
  // Initialize with all categories selected
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => 
    new Set(data.map(d => d.name))
  );

  // Update selected categories when data changes
  useMemo(() => {
    if (data.length > 0 && selectedCategories.size === 0) {
      setSelectedCategories(new Set(data.map(d => d.name)));
    }
  }, [data]);

  // Filter data based on selection
  const filteredData = useMemo(() => 
    data.filter(item => selectedCategories.has(item.name))
      .sort((a, b) => b.value - a.value),
    [data, selectedCategories]
  );

  const toggleCategory = (name: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCategories(new Set(data.map(d => d.name)));
  };

  const clearAll = () => {
    setSelectedCategories(new Set());
  };

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

  const total = filteredData.reduce((sum, item) => sum + item.value, 0);

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
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Cost Breakdown</CardTitle>
          <div className="flex gap-2 text-xs">
            <button 
              onClick={selectAll}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              All
            </button>
            <span className="text-muted-foreground">|</span>
            <button 
              onClick={clearAll}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              None
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Category selector */}
        <div className="flex flex-wrap gap-3 mb-4 p-1">
          {data.map((category) => (
            <div 
              key={category.name}
              className="flex items-center gap-1.5"
            >
              <Checkbox
                id={`cat-${category.name}`}
                checked={selectedCategories.has(category.name)}
                onCheckedChange={() => toggleCategory(category.name)}
                className="h-3.5 w-3.5"
              />
              <Label 
                htmlFor={`cat-${category.name}`}
                className="text-xs cursor-pointer flex items-center gap-1"
              >
                <span 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: category.color }}
                />
                {category.name}
              </Label>
            </div>
          ))}
        </div>

        {/* Pie chart */}
        {filteredData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <PieChart>
              <Pie
                data={filteredData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
              >
                {filteredData.map((entry, index) => (
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
                  <span className="text-xs text-foreground">{entry.payload.name}</span>
                )}
                wrapperStyle={{ fontSize: '12px' }}
              />
            </PieChart>
          </ChartContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
            Select categories to view
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-border text-center">
          <span className="text-sm text-muted-foreground">Total: </span>
          <span className="font-semibold">{formatCurrency(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
