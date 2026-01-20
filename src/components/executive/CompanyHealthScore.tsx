import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';

interface HealthData {
  profitMargin: number;
  fleetUtilization: number;
  onTimeRate: number;
  revenueGrowth: number; // percentage change from previous period
}

interface CompanyHealthScoreProps {
  data?: HealthData;
  isLoading?: boolean;
}

function calculateHealthScore(data: HealthData): number {
  // Weighted scoring: each metric contributes 25%
  // Retention Rate (profitMargin): Target 65%+ (Landstar BCO typically keeps 65%)
  // Score 100 at 70%+, score 0 at 50% or below
  const retentionScore = Math.min(100, Math.max(0, ((data.profitMargin - 50) / 20) * 100));
  
  // Fleet Utilization: Target 80%+, score based on 0-100% range
  const utilizationScore = data.fleetUtilization;
  
  // On-Time Rate: Target 95%+, score based on 80-100% range
  const onTimeScore = Math.min(100, Math.max(0, ((data.onTimeRate - 80) / 20) * 100));
  
  // Revenue Growth: Positive is good, scale -20% to +20% to 0-100
  const growthScore = Math.min(100, Math.max(0, ((data.revenueGrowth + 20) / 40) * 100));
  
  return Math.round((retentionScore * 0.25) + (utilizationScore * 0.25) + (onTimeScore * 0.25) + (growthScore * 0.25));
}

function getHealthStatus(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 80) {
    return { label: 'Excellent', color: 'text-green-500', bgColor: 'bg-green-500/10' };
  } else if (score >= 60) {
    return { label: 'Good', color: 'text-primary', bgColor: 'bg-primary/10' };
  } else if (score >= 40) {
    return { label: 'Needs Attention', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' };
  } else {
    return { label: 'Critical', color: 'text-destructive', bgColor: 'bg-destructive/10' };
  }
}

export function CompanyHealthScore({ data, isLoading }: CompanyHealthScoreProps) {
  if (isLoading || !data) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Company Health
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Skeleton className="h-24 w-24 rounded-full" />
        </CardContent>
      </Card>
    );
  }

  const score = calculateHealthScore(data);
  const status = getHealthStatus(score);
  
  // Calculate the stroke dasharray for the circular progress
  const circumference = 2 * Math.PI * 40; // radius = 40
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Company Health
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-4">
        {/* Circular Progress Gauge */}
        <div className="relative w-28 h-28">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={score >= 80 ? 'hsl(142 70% 45%)' : score >= 60 ? 'hsl(var(--primary))' : score >= 40 ? 'hsl(38 92% 50%)' : 'hsl(0 70% 50%)'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${status.color}`}>{score}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</span>
          </div>
        </div>
        
        {/* Status Badge */}
        <div className={`mt-3 px-3 py-1 rounded-full ${status.bgColor}`}>
          <span className={`text-xs font-semibold ${status.color}`}>{status.label}</span>
        </div>

        {/* Metric Breakdown */}
        <div className="grid grid-cols-2 gap-2 mt-4 w-full text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Retention</span>
            <span className="font-medium">{data.profitMargin.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Utilization</span>
            <span className="font-medium">{data.fleetUtilization.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">On-Time</span>
            <span className="font-medium">{data.onTimeRate.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Growth</span>
            <span className={`font-medium ${data.revenueGrowth >= 0 ? 'text-green-500' : 'text-destructive'}`}>
              {data.revenueGrowth >= 0 ? '+' : ''}{data.revenueGrowth.toFixed(0)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
