import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronUp, ChevronDown, Minus, Fuel } from 'lucide-react';
import { DriverMetric } from '@/hooks/useDriverPerformanceData';
import { EmptyState } from '@/components/shared/EmptyState';
import { Target } from 'lucide-react';

interface PerformanceLeaderboardProps {
  metrics: DriverMetric[];
  fleetAverages: { loads: number; miles: number; revenue: number; score: number };
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

function TrendIndicator({ value, average }: { value: number; average: number }) {
  if (average === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
  const diff = ((value - average) / average) * 100;
  if (Math.abs(diff) < 5) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (diff > 0) return <ChevronUp className="h-4 w-4 text-success" />;
  return <ChevronDown className="h-4 w-4 text-destructive" />;
}

export function PerformanceLeaderboard({ metrics, fleetAverages, selectedDriver }: PerformanceLeaderboardProps) {
  const filteredMetrics = selectedDriver === 'all'
    ? metrics
    : metrics.filter(m => m.driver.id === selectedDriver);

  if (filteredMetrics.length === 0) {
    return (
      <Card className="card-elevated">
        <CardContent className="pt-6">
          <EmptyState
            icon={Target}
            title="No performance data available"
            description="No delivered loads, inspections, or incidents found for the selected period. Data will appear here once drivers complete deliveries."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle>Driver Rankings</CardTitle>
        <CardDescription>Sorted by overall performance score</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Loads</TableHead>
                <TableHead className="text-right">Miles</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">$/Mile</TableHead>
                <TableHead className="text-right">MPG</TableHead>
                <TableHead className="text-right">Fuel $/Mi</TableHead>
                <TableHead className="text-right">Safety</TableHead>
                <TableHead className="text-right">Overall Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMetrics.map((metric) => {
                const globalIndex = metrics.findIndex(m => m.driver.id === metric.driver.id);
                const badge = getScoreBadge(metric.overallScore);
                const isHighlighted = selectedDriver !== 'all' && metric.driver.id === selectedDriver;
                return (
                  <TableRow key={metric.driver.id} className={isHighlighted ? 'bg-primary/5' : ''}>
                    <TableCell>
                      {globalIndex < 3 ? (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          globalIndex === 0 ? 'bg-yellow-400 text-yellow-900' :
                          globalIndex === 1 ? 'bg-gray-300 text-gray-800' :
                          'bg-amber-600 text-white'
                        }`}>
                          {globalIndex + 1}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{globalIndex + 1}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {metric.driver.first_name} {metric.driver.last_name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {metric.totalLoads}
                        <TrendIndicator value={metric.totalLoads} average={fleetAverages.loads} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{metric.totalMiles.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium text-success">
                      {formatCurrency(metric.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">${metric.revenuePerMile.toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${getMpgColor(metric.mpg)}`}>
                      {metric.mpg !== null ? metric.mpg.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {metric.fuelCostPerMile !== null ? `$${metric.fuelCostPerMile.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={getScoreColor(metric.safetyScore)}>
                        {metric.safetyScore.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={badge.color}>{metric.overallScore.toFixed(0)}%</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
