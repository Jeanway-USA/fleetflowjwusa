import { useState, lazy, Suspense } from 'react';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatStrip } from '@/components/shared/StatStrip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy } from 'lucide-react';
import { useDriverPerformanceData, PerformancePeriod } from '@/hooks/useDriverPerformanceData';
import { ScoringMethodology } from '@/components/performance/ScoringMethodology';
import { PerformanceLeaderboard } from '@/components/performance/PerformanceLeaderboard';
import { PerformanceScorecards } from '@/components/performance/PerformanceScorecards';
const PerformanceCharts = lazy(() =>
  import('@/components/performance/PerformanceCharts').then(m => ({ default: m.PerformanceCharts })),
);
import { ChartSkeleton } from '@/components/shared/LazyFallbacks';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export default function DriverPerformance() {
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>('current');
  const [selectedDriver, setSelectedDriver] = useState<string>('all');

  const { drivers, driverMetrics, fleetAverages } = useDriverPerformanceData(selectedPeriod);

  return (
    <>
      <PageHeader
        title="Driver Performance"
        description="Track driver metrics, scorecards, and rankings"
      />

      {/* Scoring Explanation */}
      <ScoringMethodology />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as PerformancePeriod)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current Month</SelectItem>
            <SelectItem value="last">Last Month</SelectItem>
            <SelectItem value="last3">Last 3 Months</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedDriver} onValueChange={setSelectedDriver}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <StatStrip
        className="mb-6"
        cells={[
          { label: 'Active drivers', value: drivers.length, note: `Fleet average score: ${fleetAverages.score.toFixed(0)}%` },
          { label: 'Avg loads per driver', value: fleetAverages.loads.toFixed(1), note: 'Per selected period' },
          { label: 'Avg revenue per driver', value: formatCurrency(fleetAverages.revenue), note: 'Per selected period' },
          { label: 'Top performer', value: driverMetrics[0]?.driver.first_name || '—', note: `Score: ${driverMetrics[0]?.overallScore.toFixed(0) || 0}%` },
        ]}
      />

      <Tabs defaultValue="leaderboard" className="w-full">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="scorecards">Scorecards</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="mt-6">
          <PerformanceLeaderboard
            metrics={driverMetrics}
            fleetAverages={fleetAverages}
            selectedDriver={selectedDriver}
          />
        </TabsContent>

        <TabsContent value="scorecards" className="mt-6">
          <PerformanceScorecards
            metrics={driverMetrics}
            selectedDriver={selectedDriver}
          />
        </TabsContent>

        <TabsContent value="charts" className="mt-6">
          <Suspense fallback={<ChartSkeleton height={400} />}>
            <PerformanceCharts metrics={driverMetrics} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </>
  );
}
