import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, Percent, Banknote, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPIData {
  grossRevenue: number;
  netRevenue: number;
  operatingProfit: number;
  profitMargin: number;
  prevGrossRevenue: number;
  prevNetRevenue: number;
  prevOperatingProfit: number;
  prevProfitMargin: number;
  deliveredLoadCount: number;
  prevDeliveredLoadCount: number;
}

interface RevenueKPICardsProps {
  data: KPIData | undefined;
  isLoading: boolean;
}

function formatCurrency(amount: number) {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function calculateChange(current: number, previous: number): { value: number; isPositive: boolean } {
  if (previous === 0) return { value: 0, isPositive: true };
  const change = ((current - previous) / previous) * 100;
  return { value: Math.abs(change), isPositive: change >= 0 };
}

function KPICard({
  title,
  value,
  previousValue,
  icon: Icon,
  format = 'currency',
  isLoading,
  subtitle,
}: {
  title: string;
  value: number;
  previousValue: number;
  icon: React.ElementType;
  format?: 'currency' | 'percent';
  isLoading: boolean;
  subtitle?: string;
}) {
  const change = calculateChange(value, previousValue);
  const displayValue = format === 'percent' ? `${value.toFixed(1)}%` : formatCurrency(value);

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="p-6">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border hover:border-primary/30 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="text-2xl font-bold mb-1">{displayValue}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mb-1">{subtitle}</div>
        )}
        <div className="flex items-center gap-1 text-sm">
          {change.isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
          <span className={cn(change.isPositive ? 'text-green-500' : 'text-destructive')}>
            {change.value.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs prior period</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function RevenueKPICards({ data, isLoading }: RevenueKPICardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Gross Revenue"
        value={data?.grossRevenue ?? 0}
        previousValue={data?.prevGrossRevenue ?? 0}
        icon={DollarSign}
        isLoading={isLoading}
        subtitle={`${data?.deliveredLoadCount ?? 0} loads delivered`}
      />
      <KPICard
        title="Company Revenue"
        value={data?.netRevenue ?? 0}
        previousValue={data?.prevNetRevenue ?? 0}
        icon={Banknote}
        isLoading={isLoading}
        subtitle="After Landstar split"
      />
      <KPICard
        title="Total Profit"
        value={data?.operatingProfit ?? 0}
        previousValue={data?.prevOperatingProfit ?? 0}
        icon={PiggyBank}
        isLoading={isLoading}
        subtitle="Company earnings"
      />
      <KPICard
        title="Retention Rate"
        value={data?.profitMargin ?? 0}
        previousValue={data?.prevProfitMargin ?? 0}
        icon={Percent}
        format="percent"
        isLoading={isLoading}
        subtitle="% of gross kept"
      />
    </div>
  );
}
