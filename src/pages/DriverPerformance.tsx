import { useState } from 'react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Target, DollarSign, Award } from 'lucide-react';
import { useDriverPerformanceData, PerformancePeriod } from '@/hooks/useDriverPerformanceData';
import { ScoringMethodology } from '@/components/performance/ScoringMethodology';
import { PerformanceLeaderboard } from '@/components/performance/PerformanceLeaderboard';
import { PerformanceScorecards } from '@/components/performance/PerformanceScorecards';
import { PerformanceCharts } from '@/components/performance/PerformanceCharts';

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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <Trophy className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{drivers.length}</div>
            <p className="text-xs text-muted-foreground">Fleet average score: {fleetAverages.score.toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Loads/Driver</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fleetAverages.loads.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Per selected period</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue/Driver</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCurrency(fleetAverages.revenue)}</div>
            <p className="text-xs text-muted-foreground">Per selected period</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Top Performer</CardTitle>
            <Award className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {driverMetrics[0]?.driver.first_name || '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Score: {driverMetrics[0]?.overallScore.toFixed(0) || 0}%
            </p>
          </CardContent>
        </Card>
      </div>

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
          <PerformanceCharts metrics={driverMetrics} />
        </TabsContent>
      </Tabs>
    </>
  );
}
