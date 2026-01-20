import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CostCategory {
  name: string;
  value: number;
  color: string;
}

interface CostBreakdownChartProps {
  data: CostCategory[];
  isLoading: boolean;
}

// Muted, professional color palette - easier on the eyes
const SOFT_COLORS = [
  'hsl(210 40% 55%)',  // Soft blue
  'hsl(160 35% 50%)',  // Sage green
  'hsl(35 50% 55%)',   // Warm tan
  'hsl(280 30% 55%)',  // Muted purple
  'hsl(185 35% 50%)',  // Teal
  'hsl(350 40% 55%)',  // Dusty rose
  'hsl(50 45% 50%)',   // Muted gold
  'hsl(220 35% 50%)',  // Slate blue
  'hsl(140 30% 50%)',  // Olive
  'hsl(15 45% 55%)',   // Terracotta
];

const chartConfig = {
  value: { label: 'Amount' },
};

export function CostBreakdownChart({ data, isLoading }: CostBreakdownChartProps) {
  // Initialize with all categories selected
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => 
    new Set(data.map(d => d.name))
  );

  // Update selected categories when data changes (new categories appear)
  useMemo(() => {
    const newCategories = data.filter(d => !selectedCategories.has(d.name));
    if (newCategories.length > 0 && selectedCategories.size === 0) {
      setSelectedCategories(new Set(data.map(d => d.name)));
    }
  }, [data]);

  // Apply soft colors to data
  const coloredData = useMemo(() => 
    data.map((item, index) => ({
      ...item,
      color: SOFT_COLORS[index % SOFT_COLORS.length],
    })), [data]
  );

  // Filter data based on selection
  const filteredData = useMemo(() => 
    coloredData.filter(item => selectedCategories.has(item.name))
      .sort((a, b) => b.value - a.value), // Sort by value descending
    [coloredData, selectedCategories]
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
    setSelectedCategories(new Set(coloredData.map(d => d.name)));
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
          <Skeleton className="h-[250px] w-full" />
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

  const formatShortCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
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
        <ScrollArea className="h-[80px] mb-4">
          <div className="flex flex-wrap gap-2 p-1">
            {coloredData.map((category) => (
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
        </ScrollArea>

        {/* Horizontal bar chart */}
        {filteredData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[180px] w-full">
            <BarChart
              data={filteredData}
              layout="vertical"
              margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
            >
              <XAxis 
                type="number" 
                hide 
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={90}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatCurrency(value as number)}
                  />
                }
              />
              <Bar 
                dataKey="value" 
                radius={[0, 4, 4, 0]}
                label={{ 
                  position: 'right', 
                  fontSize: 10,
                  fill: 'hsl(var(--muted-foreground))',
                  formatter: (value: number) => formatShortCurrency(value),
                }}
              >
                {filteredData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
            Select categories to view
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border text-center">
          <span className="text-sm text-muted-foreground">Selected Total: </span>
          <span className="font-semibold">{formatCurrency(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
