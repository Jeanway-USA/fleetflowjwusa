import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Trophy, Sparkles } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface MonthlyBonusWidgetProps {
  driverId: string;
}

const TARGET = 24000;

export function MonthlyBonusWidget({ driverId }: MonthlyBonusWidgetProps) {
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const currentMonth = format(now, 'MMMM yyyy');

  const { data: monthlyRevenue = 0, isLoading } = useQuery({
    queryKey: ['driver-monthly-revenue', driverId, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('gross_revenue')
        .eq('driver_id', driverId)
        .eq('status', 'delivered')
        .gte('delivery_date', monthStart)
        .lte('delivery_date', monthEnd);

      if (error) throw error;

      return data?.reduce((sum, load) => sum + (load.gross_revenue || 0), 0) || 0;
    },
    enabled: !!driverId,
  });

  const percentage = Math.min((monthlyRevenue / TARGET) * 100, 100);
  const actualPercentage = (monthlyRevenue / TARGET) * 100;

  // Determine color and label based on percentage
  let progressColorClass = '';
  let label = '';
  let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';

  if (actualPercentage >= 100) {
    progressColorClass = 'bg-green-500';
    label = 'BONUS UNLOCKED 🎉';
    badgeVariant = 'default';
  } else if (actualPercentage >= 75) {
    progressColorClass = 'bg-orange-500';
    label = 'Almost There!';
    badgeVariant = 'outline';
  } else {
    progressColorClass = 'bg-yellow-500';
    label = 'Keep Pushing';
    badgeVariant = 'secondary';
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {actualPercentage >= 100 ? (
            <Sparkles className="h-5 w-5 text-green-500" />
          ) : (
            <Trophy className="h-5 w-5 text-primary" />
          )}
          Monthly Bonus Goal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Hit {formatCurrency(TARGET)} in deliveries this month to unlock a{' '}
          <span className="font-semibold text-primary">$0.05/mile bonus</span> on every load!
        </p>

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {isLoading ? '...' : formatCurrency(monthlyRevenue)} / {formatCurrency(TARGET)}
          </span>
          <Badge variant={badgeVariant} className={actualPercentage >= 100 ? 'bg-green-500 text-white' : ''}>
            {label}
          </Badge>
        </div>

        <div className="relative">
          <Progress value={percentage} className="h-3" />
          <div
            className={`absolute top-0 left-0 h-3 rounded-full transition-all ${progressColorClass}`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground text-right">{currentMonth}</p>
      </CardContent>
    </Card>
  );
}
