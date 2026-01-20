import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Trophy, TrendingUp, Route, DollarSign, Clock, Shield, 
  Fuel, Award, Target, ChevronUp, ChevronDown, Minus
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
}

interface FleetLoad {
  id: string;
  driver_id: string | null;
  delivery_date: string | null;
  status: string;
  net_revenue: number | null;
  actual_miles: number | null;
  booked_miles: number | null;
}

interface Inspection {
  id: string;
  driver_id: string;
  inspection_date: string;
  defects_found: boolean;
}

interface Incident {
  id: string;
  driver_id: string | null;
  incident_date: string;
  severity: string;
}

export default function DriverPerformance() {
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [selectedDriver, setSelectedDriver] = useState<string>('all');

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').eq('status', 'active');
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*');
      if (error) throw error;
      return data as FleetLoad[];
    },
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ['driver_inspections'],
    queryFn: async () => {
      const { data, error } = await supabase.from('driver_inspections').select('*');
      if (error) throw error;
      return data as Inspection[];
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('incidents').select('*');
      if (error) throw error;
      return data as Incident[];
    },
  });

  // Calculate period range
  const getPeriodRange = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'current':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last':
        return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
      case 'last3':
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  // Calculate driver metrics
  const driverMetrics = useMemo(() => {
    const { start, end } = getPeriodRange();
    
    return drivers.map(driver => {
      // Filter loads for this driver in the period
      const driverLoads = loads.filter(load => {
        if (load.driver_id !== driver.id || !load.delivery_date) return false;
        const date = parseISO(load.delivery_date);
        return isWithinInterval(date, { start, end }) && load.status === 'delivered';
      });

      // Filter inspections
      const driverInspections = inspections.filter(insp => {
        if (insp.driver_id !== driver.id) return false;
        const date = parseISO(insp.inspection_date);
        return isWithinInterval(date, { start, end });
      });

      // Filter incidents
      const driverIncidents = incidents.filter(inc => {
        if (inc.driver_id !== driver.id || !inc.incident_date) return false;
        const date = parseISO(inc.incident_date);
        return isWithinInterval(date, { start, end });
      });

      const totalLoads = driverLoads.length;
      const totalMiles = driverLoads.reduce((sum, l) => sum + (l.actual_miles || 0), 0);
      const totalRevenue = driverLoads.reduce((sum, l) => sum + (l.net_revenue || 0), 0);
      const onTimeCount = driverLoads.length; // Simplified - assume all delivered are on time
      
      const totalInspections = driverInspections.length;
      const cleanInspections = driverInspections.filter(i => !i.defects_found).length;
      const dvirCompliance = totalInspections > 0 ? (cleanInspections / totalInspections) * 100 : 100;
      
      const incidentCount = driverIncidents.length;
      const severeIncidents = driverIncidents.filter(i => i.severity === 'major' || i.severity === 'critical').length;
      
      // Calculate scores (0-100)
      const productivityScore = Math.min(100, (totalLoads / 10) * 100); // 10 loads = 100%
      const safetyScore = Math.max(0, 100 - (incidentCount * 10) - (severeIncidents * 20));
      const complianceScore = dvirCompliance;
      const revenueScore = Math.min(100, (totalRevenue / 20000) * 100); // $20k = 100%
      
      const overallScore = (productivityScore + safetyScore + complianceScore + revenueScore) / 4;
      
      return {
        driver,
        totalLoads,
        totalMiles,
        totalRevenue,
        onTimeRate: totalLoads > 0 ? 100 : 0,
        dvirCompliance,
        incidentCount,
        productivityScore,
        safetyScore,
        complianceScore,
        revenueScore,
        overallScore,
        revenuePerMile: totalMiles > 0 ? totalRevenue / totalMiles : 0,
      };
    }).sort((a, b) => b.overallScore - a.overallScore);
  }, [drivers, loads, inspections, incidents, selectedPeriod]);

  // Fleet averages
  const fleetAverages = useMemo(() => {
    if (driverMetrics.length === 0) return { loads: 0, miles: 0, revenue: 0, score: 0 };
    return {
      loads: driverMetrics.reduce((s, d) => s + d.totalLoads, 0) / driverMetrics.length,
      miles: driverMetrics.reduce((s, d) => s + d.totalMiles, 0) / driverMetrics.length,
      revenue: driverMetrics.reduce((s, d) => s + d.totalRevenue, 0) / driverMetrics.length,
      score: driverMetrics.reduce((s, d) => s + d.overallScore, 0) / driverMetrics.length,
    };
  }, [driverMetrics]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) return { label: 'Excellent', color: 'bg-success text-success-foreground' };
    if (score >= 80) return { label: 'Good', color: 'bg-primary/20 text-primary' };
    if (score >= 60) return { label: 'Average', color: 'bg-warning/20 text-warning' };
    return { label: 'Needs Improvement', color: 'bg-destructive/20 text-destructive' };
  };

  const TrendIndicator = ({ value, average }: { value: number; average: number }) => {
    const diff = ((value - average) / average) * 100;
    if (Math.abs(diff) < 5) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (diff > 0) return <ChevronUp className="h-4 w-4 text-success" />;
    return <ChevronDown className="h-4 w-4 text-destructive" />;
  };

  // Chart data for top performers
  const chartData = driverMetrics.slice(0, 5).map(m => ({
    name: `${m.driver.first_name} ${m.driver.last_name.charAt(0)}.`,
    score: Math.round(m.overallScore),
    revenue: m.totalRevenue,
    loads: m.totalLoads,
  }));

  return (
    <DashboardLayout>
      <PageHeader 
        title="Driver Performance" 
        description="Track driver metrics, scorecards, and rankings"
      />

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current Month</SelectItem>
            <SelectItem value="last">Last Month</SelectItem>
            <SelectItem value="last3">Last 3 Months</SelectItem>
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
              {driverMetrics[0]?.driver.first_name || '-'}
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
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Driver Rankings</CardTitle>
              <CardDescription>Sorted by overall performance score</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">$/Mile</TableHead>
                    <TableHead className="text-right">Safety</TableHead>
                    <TableHead className="text-right">Overall Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driverMetrics.map((metric, index) => {
                    const badge = getScoreBadge(metric.overallScore);
                    return (
                      <TableRow key={metric.driver.id}>
                        <TableCell>
                          {index < 3 ? (
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                              index === 0 ? 'bg-yellow-400 text-yellow-900' :
                              index === 1 ? 'bg-gray-300 text-gray-800' :
                              'bg-amber-600 text-white'
                            }`}>
                              {index + 1}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{index + 1}</span>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scorecards" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {driverMetrics.map((metric, index) => {
              const badge = getScoreBadge(metric.overallScore);
              return (
                <Card key={metric.driver.id} className="card-elevated">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{metric.driver.first_name} {metric.driver.last_name}</CardTitle>
                      {index < 3 && (
                        <Trophy className={`h-5 w-5 ${
                          index === 0 ? 'text-yellow-500' :
                          index === 1 ? 'text-gray-400' :
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
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Productivity</span>
                          <span>{metric.productivityScore.toFixed(0)}%</span>
                        </div>
                        <Progress value={metric.productivityScore} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Safety</span>
                          <span>{metric.safetyScore.toFixed(0)}%</span>
                        </div>
                        <Progress value={metric.safetyScore} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Compliance</span>
                          <span>{metric.complianceScore.toFixed(0)}%</span>
                        </div>
                        <Progress value={metric.complianceScore} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Revenue</span>
                          <span>{metric.revenueScore.toFixed(0)}%</span>
                        </div>
                        <Progress value={metric.revenueScore} className="h-2" />
                      </div>
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="charts" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Top 5 - Overall Scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip />
                      <Bar dataKey="score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Top 5 - Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="revenue" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
