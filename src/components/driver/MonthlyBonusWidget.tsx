import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Trophy, Sparkles } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import confetti from 'canvas-confetti';

interface MonthlyBonusWidgetProps {
  driverId: string;
}

const TARGET_MILES = 12000;

export function MonthlyBonusWidget({ driverId }: MonthlyBonusWidgetProps) {
  const hasTriggeredConfetti = useRef(false);
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const currentMonth = format(now, 'MMMM yyyy');

  const { data: monthlyMiles = 0, isLoading } = useQuery({
    queryKey: ['driver-monthly-miles', driverId, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('actual_miles, booked_miles')
        .eq('driver_id', driverId)
        .eq('status', 'delivered')
        .gte('delivery_date', monthStart)
        .lte('delivery_date', monthEnd);

      if (error) throw error;

      // Use actual_miles if available, otherwise fall back to booked_miles
      return data?.reduce((sum, load) => sum + (load.actual_miles || load.booked_miles || 0), 0) || 0;
    },
    enabled: !!driverId,
  });

  const percentage = Math.min((monthlyMiles / TARGET_MILES) * 100, 100);
  const actualPercentage = (monthlyMiles / TARGET_MILES) * 100;
  const bonusUnlocked = actualPercentage >= 100;

  // Trigger confetti when bonus is unlocked
  useEffect(() => {
    if (bonusUnlocked && !hasTriggeredConfetti.current && !isLoading) {
      hasTriggeredConfetti.current = true;
      
      // Fire confetti from both sides
      const fireConfetti = () => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { x: 0.1, y: 0.6 },
          colors: ['#22c55e', '#16a34a', '#4ade80', '#fbbf24', '#f59e0b'],
        });
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { x: 0.9, y: 0.6 },
          colors: ['#22c55e', '#16a34a', '#4ade80', '#fbbf24', '#f59e0b'],
        });
      };
      
      // Fire immediately and again after a short delay for extra celebration
      fireConfetti();
      setTimeout(fireConfetti, 250);
    }
  }, [bonusUnlocked, isLoading]);

  // Determine color and label based on percentage
  let progressColorClass = '';
  let label = '';
  let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';

  if (bonusUnlocked) {
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

  const formatMiles = (miles: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(miles));
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {bonusUnlocked ? (
            <Sparkles className="h-5 w-5 text-green-500 animate-pulse" />
          ) : (
            <Trophy className="h-5 w-5 text-primary" />
          )}
          Monthly Bonus Goal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Drive {formatMiles(TARGET_MILES)} miles this month to unlock a{' '}
          <span className="font-semibold text-primary">$0.05/mile bonus</span> — every mile counts!
        </p>

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {isLoading ? '...' : formatMiles(monthlyMiles)} / {formatMiles(TARGET_MILES)} mi
          </span>
          <Badge variant={badgeVariant} className={bonusUnlocked ? 'bg-green-500 text-white animate-pulse' : ''}>
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
