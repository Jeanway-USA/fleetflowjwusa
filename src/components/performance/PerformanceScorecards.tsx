import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Trophy, Info, Fuel, ShieldCheck, Target } from 'lucide-react';
import { DriverMetric } from '@/hooks/useDriverPerformanceData';
import { EmptyState } from '@/components/shared/EmptyState';


interface PerformanceScorecardsProps {
  metrics: DriverMetric[];
  selectedDriver: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
}

function getScoreBadge(score: number) {
  if (score >= 90) return { label: 'Excellent', color: 'bg-success text-success-foreground' };
  if (score >= 80) return { label: 'Good', color: 'bg-primary/20 text-primary' };
  if (score >= 60) return { label: 'Average', color: 'bg-warning/20 text-warning' };
  return { label: 'Needs Improvement', color: 'bg-destructive/20 text-destructive' };
}

function getMpgColor(mpg: number | null) {
  if (mpg === null) return 'text-muted-foreground';
  if (mpg >= 6.5) return 'text-success';
  if (mpg >= 5.5) return 'text-warning';
  return 'text-destructive';
}

const scoreTooltips: Record<string, string> = {
  Productivity: '10+ loads/month = 100%. Score scales linearly.',
  Safety: 'Starts at 100%. -10 per incident, -20 extra for major/critical.',
  Compliance: '% of DVIR inspections with no defects found.',
  Revenue: '$20,000+ net revenue/month = 100%. Score scales linearly.',
  'Fuel Efficiency': 'MPG calculated from fuel purchases vs miles driven.',
};

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 cursor-help">
                {label}
                <Info className="h-3 w-3 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px]">
              <p className="text-xs">{scoreTooltips[label]}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>{value.toFixed(0)}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}

function BonusRing({ weeks }: { weeks: number }) {
  const size = 48;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(4, Math.max(0, weeks)) / 4;
  const dash = c * pct;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative shrink-0 cursor-help" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                className="stroke-muted"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${c - dash}`}
                className={weeks >= 4 ? 'stroke-success' : 'stroke-primary'}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">
              {weeks}/4
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px]">
          <p className="text-xs">Consecutive clean weeks toward monthly Safety & Performance Bonus. Zero incidents required.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}


export function PerformanceScorecards({ metrics, selectedDriver }: PerformanceScorecardsProps) {
  const filteredMetrics = selectedDriver === 'all'
    ? metrics
    : metrics.filter(m => m.driver.id === selectedDriver);

  if (filteredMetrics.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No performance data available"
        description="No delivered loads, inspections, or incidents found for the selected period."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {filteredMetrics.map((metric) => {
        const globalIndex = metrics.findIndex(m => m.driver.id === metric.driver.id);
        const badge = getScoreBadge(metric.overallScore);
        return (
          <Card key={metric.driver.id} className="card-elevated">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{metric.driver.first_name} {metric.driver.last_name}</CardTitle>
                {globalIndex < 3 && (
                  <Trophy className={`h-5 w-5 ${
                    globalIndex === 0 ? 'text-yellow-500' :
                    globalIndex === 1 ? 'text-gray-400' :
                    'text-amber-600'
                  }`} />
                )}
              </div>
              <Badge className={badge.color}>{badge.label}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className={`text-4xl font-bold ${getScoreColor(metric.overallScore)}`}>
                  {metric.overallScore.toFixed(0)}%
                </div>
                <p className="text-sm text-muted-foreground">Overall Score</p>
              </div>

              <div className="space-y-3">
                <ScoreRow label="Productivity" value={metric.productivityScore} />
                <ScoreRow label="Safety" value={metric.safetyScore} />
                <ScoreRow label="Compliance" value={metric.complianceScore} />
                <ScoreRow label="Revenue" value={metric.revenueScore} />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div className="text-center">
                  <p className="text-lg font-bold">{metric.totalLoads}</p>
                  <p className="text-xs text-muted-foreground">Loads</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-success">{formatCurrency(metric.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
              </div>

              {(metric.mpg !== null || metric.fuelCostPerMile !== null) && (
                <div className="flex items-center gap-2 pt-2 border-t text-sm">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                  {metric.mpg !== null && (
                    <span className={getMpgColor(metric.mpg)}>
                      {metric.mpg.toFixed(1)} MPG
                    </span>
                  )}
                  {metric.fuelCostPerMile !== null && (
                    <span className="text-muted-foreground">
                      · ${metric.fuelCostPerMile.toFixed(2)}/mi
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
