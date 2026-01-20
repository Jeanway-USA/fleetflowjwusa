import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, subWeeks, subMonths, subQuarters, subYears } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { PeriodSelector, TimePeriod } from '@/components/executive/PeriodSelector';
import { RevenueKPICards } from '@/components/executive/RevenueKPICards';
import { RevenueTrendsChart } from '@/components/executive/RevenueTrendsChart';
import { OperationalMetrics } from '@/components/executive/OperationalMetrics';
import { CostBreakdownChart } from '@/components/executive/CostBreakdownChart';
import { TopPerformerCards } from '@/components/executive/TopPerformerCards';
import { QuickInsights, Insight } from '@/components/executive/QuickInsights';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function getDateRange(period: TimePeriod) {
  const now = new Date();
  switch (period) {
    case 'week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
        prevStart: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        prevEnd: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
      };
    case 'month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        prevStart: startOfMonth(subMonths(now, 1)),
        prevEnd: endOfMonth(subMonths(now, 1)),
      };
    case 'quarter':
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        prevStart: startOfQuarter(subQuarters(now, 1)),
        prevEnd: endOfQuarter(subQuarters(now, 1)),
      };
    case 'ytd':
      return {
        start: startOfYear(now),
        end: now,
        prevStart: startOfYear(subYears(now, 1)),
        prevEnd: subYears(now, 1),
      };
  }
}

export default function ExecutiveDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('month');
  const dateRange = useMemo(() => getDateRange(period), [period]);

  // Fetch KPI data
  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['executive-kpi', period],
    queryFn: async () => {
      const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

      // Current period loads - only delivered
      const { data: currentLoads } = await supabase
        .from('fleet_loads')
        .select('gross_revenue, net_revenue')
        .eq('status', 'delivered')
        .gte('delivery_date', formatDate(dateRange.start))
        .lte('delivery_date', formatDate(dateRange.end));

      // Previous period loads - only delivered
      const { data: prevLoads } = await supabase
        .from('fleet_loads')
        .select('gross_revenue, net_revenue')
        .eq('status', 'delivered')
        .gte('delivery_date', formatDate(dateRange.prevStart))
        .lte('delivery_date', formatDate(dateRange.prevEnd));

      // Current period expenses
      const { data: currentExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .gte('expense_date', formatDate(dateRange.start))
        .lte('expense_date', formatDate(dateRange.end));

      // Previous period expenses
      const { data: prevExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .gte('expense_date', formatDate(dateRange.prevStart))
        .lte('expense_date', formatDate(dateRange.prevEnd));

      const deliveredLoadCount = currentLoads?.length || 0;
      const grossRevenue = currentLoads?.reduce((sum, l) => sum + (l.gross_revenue || 0), 0) || 0;
      const netRevenue = currentLoads?.reduce((sum, l) => sum + (l.net_revenue || 0), 0) || 0;
      const totalExpenses = currentExpenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
      const operatingProfit = netRevenue - totalExpenses;
      const profitMargin = grossRevenue > 0 ? (operatingProfit / grossRevenue) * 100 : 0;

      const prevDeliveredLoadCount = prevLoads?.length || 0;
      const prevGrossRevenue = prevLoads?.reduce((sum, l) => sum + (l.gross_revenue || 0), 0) || 0;
      const prevNetRevenue = prevLoads?.reduce((sum, l) => sum + (l.net_revenue || 0), 0) || 0;
      const prevTotalExpenses = prevExpenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
      const prevOperatingProfit = prevNetRevenue - prevTotalExpenses;
      const prevProfitMargin = prevGrossRevenue > 0 ? (prevOperatingProfit / prevGrossRevenue) * 100 : 0;

      return {
        grossRevenue,
        netRevenue,
        operatingProfit,
        profitMargin,
        prevGrossRevenue,
        prevNetRevenue,
        prevOperatingProfit,
        prevProfitMargin,
        deliveredLoadCount,
        prevDeliveredLoadCount,
      };
    },
  });

  // Fetch trends data
  const { data: trendsData = [], isLoading: trendsLoading } = useQuery({
    queryKey: ['executive-trends', period],
    queryFn: async () => {
      // Simplified: get last 6 months of data
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(now, i));
        const monthEnd = endOfMonth(subMonths(now, i));
        months.push({ start: monthStart, end: monthEnd, label: format(monthStart, 'MMM') });
      }

      const results = await Promise.all(
        months.map(async ({ start, end, label }) => {
          const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

          const { data: loads } = await supabase
            .from('fleet_loads')
            .select('gross_revenue, net_revenue')
            .eq('status', 'delivered')
            .gte('delivery_date', formatDate(start))
            .lte('delivery_date', formatDate(end));

          const { data: expenses } = await supabase
            .from('expenses')
            .select('amount')
            .gte('expense_date', formatDate(start))
            .lte('expense_date', formatDate(end));

          return {
            period: label,
            grossRevenue: loads?.reduce((sum, l) => sum + (l.gross_revenue || 0), 0) || 0,
            netRevenue: loads?.reduce((sum, l) => sum + (l.net_revenue || 0), 0) || 0,
            operatingCosts: expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
          };
        })
      );

      return results;
    },
  });

  // Fetch operational metrics
  const { data: operationalData, isLoading: operationalLoading } = useQuery({
    queryKey: ['executive-operational', period],
    queryFn: async () => {
      const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

      const { data: loads } = await supabase
        .from('fleet_loads')
        .select('actual_miles, booked_miles, net_revenue')
        .eq('status', 'delivered')
        .gte('delivery_date', formatDate(dateRange.start))
        .lte('delivery_date', formatDate(dateRange.end));

      const { data: trucks } = await supabase.from('trucks').select('id, status');
      const { data: activeLoads } = await supabase
        .from('fleet_loads')
        .select('truck_id')
        .in('status', ['in_transit', 'at_pickup', 'at_delivery']);

      const totalLoads = loads?.length || 0;
      const totalMiles = loads?.reduce((sum, l) => sum + (l.actual_miles || l.booked_miles || 0), 0) || 0;
      const totalNetRevenue = loads?.reduce((sum, l) => sum + (l.net_revenue || 0), 0) || 0;
      const revenuePerMile = totalMiles > 0 ? totalNetRevenue / totalMiles : 0;

      const activeTrucks = trucks?.filter((t) => t.status === 'active').length || 0;
      const trucksWithLoads = new Set(activeLoads?.map((l) => l.truck_id)).size;
      const fleetUtilization = activeTrucks > 0 ? (trucksWithLoads / activeTrucks) * 100 : 0;

      return {
        totalLoads,
        totalMiles,
        revenuePerMile,
        fleetUtilization,
        onTimeRate: 95, // Placeholder - would need delivery_on_time field
      };
    },
  });

  // Fetch cost breakdown
  const { data: costBreakdown = [], isLoading: costLoading } = useQuery({
    queryKey: ['executive-costs', period],
    queryFn: async () => {
      const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

      const { data: expenses } = await supabase
        .from('expenses')
        .select('expense_type, amount')
        .gte('expense_date', formatDate(dateRange.start))
        .lte('expense_date', formatDate(dateRange.end));

      const grouped = (expenses || []).reduce<Record<string, number>>((acc, e) => {
        const type = e.expense_type || 'other';
        acc[type] = (acc[type] || 0) + (e.amount || 0);
        return acc;
      }, {});

      // Dynamic color palette for all expense types
      const colorPalette = [
        'hsl(45 80% 50%)',   // Gold
        'hsl(200 70% 50%)',  // Blue
        'hsl(280 70% 50%)',  // Purple
        'hsl(142 70% 45%)',  // Green
        'hsl(0 70% 50%)',    // Red
        'hsl(30 80% 50%)',   // Orange
        'hsl(180 60% 45%)',  // Teal
        'hsl(320 70% 50%)',  // Pink
        'hsl(60 70% 45%)',   // Yellow-green
        'hsl(240 60% 55%)',  // Indigo
      ];

      const entries = Object.entries(grouped);
      return entries.map(([name, value], index) => ({
        name: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        value,
        color: colorPalette[index % colorPalette.length],
      }));
    },
  });

  // Fetch top performers
  const { data: topPerformers, isLoading: performersLoading } = useQuery({
    queryKey: ['executive-performers', period],
    queryFn: async () => {
      const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

      // Get loads with driver and truck info
      const { data: loads } = await supabase
        .from('fleet_loads')
        .select('driver_id, truck_id, gross_revenue, actual_miles, booked_miles')
        .eq('status', 'delivered')
        .gte('delivery_date', formatDate(dateRange.start))
        .lte('delivery_date', formatDate(dateRange.end));

      // Aggregate by driver
      const driverStats = (loads || []).reduce<Record<string, { revenue: number; miles: number; loads: number }>>((acc, l) => {
        if (l.driver_id) {
          if (!acc[l.driver_id]) acc[l.driver_id] = { revenue: 0, miles: 0, loads: 0 };
          acc[l.driver_id].revenue += l.gross_revenue || 0;
          acc[l.driver_id].miles += l.actual_miles || l.booked_miles || 0;
          acc[l.driver_id].loads += 1;
        }
        return acc;
      }, {});

      // Aggregate by truck
      const truckStats = (loads || []).reduce<Record<string, { revenue: number; miles: number; loads: number }>>((acc, l) => {
        if (l.truck_id) {
          if (!acc[l.truck_id]) acc[l.truck_id] = { revenue: 0, miles: 0, loads: 0 };
          acc[l.truck_id].revenue += l.gross_revenue || 0;
          acc[l.truck_id].miles += l.actual_miles || l.booked_miles || 0;
          acc[l.truck_id].loads += 1;
        }
        return acc;
      }, {});

      // Find top driver
      const topDriverEntry = Object.entries(driverStats).sort((a, b) => b[1].revenue - a[1].revenue)[0];
      let topDriver = undefined;
      if (topDriverEntry) {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('first_name, last_name, avatar_url')
          .eq('id', topDriverEntry[0])
          .single();

        if (driverData) {
          topDriver = {
            id: topDriverEntry[0],
            name: `${driverData.first_name} ${driverData.last_name}`,
            avatarUrl: driverData.avatar_url || undefined,
            revenue: topDriverEntry[1].revenue,
            miles: topDriverEntry[1].miles,
            loads: topDriverEntry[1].loads,
          };
        }
      }

      // Find top truck
      const topTruckEntry = Object.entries(truckStats).sort((a, b) => b[1].revenue - a[1].revenue)[0];
      let topTruck = undefined;
      if (topTruckEntry) {
        const { data: truckData } = await supabase
          .from('trucks')
          .select('unit_number, status')
          .eq('id', topTruckEntry[0])
          .single();

        if (truckData) {
          topTruck = {
            id: topTruckEntry[0],
            unitNumber: truckData.unit_number,
            revenue: topTruckEntry[1].revenue,
            miles: topTruckEntry[1].miles,
            loads: topTruckEntry[1].loads,
            status: truckData.status,
          };
        }
      }

      return { topDriver, topTruck };
    },
  });

  // Generate insights
  const insights: Insight[] = useMemo(() => {
    const result: Insight[] = [];

    if (kpiData) {
      // Revenue change insight
      const revenueChange = kpiData.prevGrossRevenue > 0
        ? ((kpiData.grossRevenue - kpiData.prevGrossRevenue) / kpiData.prevGrossRevenue) * 100
        : 0;
      if (revenueChange > 10) {
        result.push({
          id: '1',
          type: 'success',
          message: `Revenue is up ${revenueChange.toFixed(0)}% compared to the prior period`,
        });
      } else if (revenueChange < -10) {
        result.push({
          id: '2',
          type: 'alert',
          message: `Revenue is down ${Math.abs(revenueChange).toFixed(0)}% compared to the prior period`,
        });
      }

      // Profit margin insight
      if (kpiData.profitMargin > 30) {
        result.push({
          id: '3',
          type: 'success',
          message: `Healthy profit margin of ${kpiData.profitMargin.toFixed(1)}%`,
        });
      } else if (kpiData.profitMargin < 15) {
        result.push({
          id: '4',
          type: 'warning',
          message: `Profit margin is below target at ${kpiData.profitMargin.toFixed(1)}%`,
        });
      }
    }

    if (operationalData) {
      if (operationalData.fleetUtilization < 70) {
        result.push({
          id: '5',
          type: 'warning',
          message: `Fleet utilization at ${operationalData.fleetUtilization.toFixed(0)}% - consider optimizing dispatch`,
        });
      } else if (operationalData.fleetUtilization > 90) {
        result.push({
          id: '6',
          type: 'success',
          message: `Excellent fleet utilization at ${operationalData.fleetUtilization.toFixed(0)}%`,
        });
      }
    }

    if (topPerformers?.topDriver) {
      result.push({
        id: '7',
        type: 'info',
        message: `${topPerformers.topDriver.name} is your top performer with ${topPerformers.topDriver.loads} loads`,
      });
    }

    return result.slice(0, 5);
  }, [kpiData, operationalData, topPerformers]);

  const isLoading = kpiLoading || trendsLoading || operationalLoading || costLoading || performersLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Executive Dashboard"
            description="High-level overview of business performance and key metrics"
          />
          <div className="flex items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} />
            <Badge variant="outline" className="gap-1">
              <Bell className="h-3 w-3" />
              {insights.filter((i) => i.type === 'warning' || i.type === 'alert').length}
            </Badge>
          </div>
        </div>

        {/* KPI Cards */}
        <RevenueKPICards data={kpiData} isLoading={kpiLoading} />

        {/* Revenue Trends Chart */}
        <RevenueTrendsChart data={trendsData} isLoading={trendsLoading} />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OperationalMetrics data={operationalData} isLoading={operationalLoading} />
          <CostBreakdownChart data={costBreakdown} isLoading={costLoading} />
        </div>

        {/* Top Performers */}
        <TopPerformerCards
          topDriver={topPerformers?.topDriver}
          topTruck={topPerformers?.topTruck}
          isLoading={performersLoading}
        />

        {/* Quick Insights */}
        <QuickInsights insights={insights} isLoading={isLoading} />
      </div>
    </DashboardLayout>
  );
}
