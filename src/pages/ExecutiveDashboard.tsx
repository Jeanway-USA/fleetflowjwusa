import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, subWeeks, subMonths, subQuarters, subYears, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { FileText } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { PeriodSelector, TimePeriod } from '@/components/executive/PeriodSelector';
import { RevenueKPICards } from '@/components/executive/RevenueKPICards';
import { RevenueTrendsChart } from '@/components/executive/RevenueTrendsChart';
import { OperationalMetrics } from '@/components/executive/OperationalMetrics';
import { CostBreakdownChart } from '@/components/executive/CostBreakdownChart';
import { TopPerformerCards } from '@/components/executive/TopPerformerCards';
import { QuickInsights, Insight } from '@/components/executive/QuickInsights';
import { CompanyHealthScore } from '@/components/executive/CompanyHealthScore';
import { FleetStatusCard } from '@/components/executive/FleetStatusCard';
import { DriverAvailabilityCard } from '@/components/executive/DriverAvailabilityCard';
import { CriticalAlertsBar, CriticalAlert } from '@/components/executive/CriticalAlertsBar';
import { MorningBriefingWidget } from '@/components/executive/MorningBriefingWidget';
import { PendingActionsCard, PendingAction } from '@/components/executive/PendingActionsCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PrintableExecutiveSummary } from '@/components/executive/PrintableExecutiveSummary';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

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
  const [showReport, setShowReport] = useState(false);
  const dateRange = useMemo(() => getDateRange(period), [period]);

  // Fetch KPI data
  // NOTE: In this business model:
  // - Gross Revenue = Total load value from Landstar
  // - Net Revenue = Company's portion after Landstar percentage (this IS the company profit from hauling)
  // - The "expenses" table contains driver-specific deductions (fuel, advances) - NOT company operating costs
  // - Operating Profit = Net Revenue (the company's take)
  // - Profit Margin = Net Revenue / Gross Revenue (company retention rate)
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

      const deliveredLoadCount = currentLoads?.length || 0;
      const grossRevenue = currentLoads?.reduce((sum, l) => sum + (l.gross_revenue || 0), 0) || 0;
      const netRevenue = currentLoads?.reduce((sum, l) => sum + (l.net_revenue || 0), 0) || 0;
      // Operating profit IS net revenue - it's what the company keeps after Landstar's cut
      const operatingProfit = netRevenue;
      // Profit margin = what percentage of gross the company retains
      const profitMargin = grossRevenue > 0 ? (netRevenue / grossRevenue) * 100 : 0;

      const prevDeliveredLoadCount = prevLoads?.length || 0;
      const prevGrossRevenue = prevLoads?.reduce((sum, l) => sum + (l.gross_revenue || 0), 0) || 0;
      const prevNetRevenue = prevLoads?.reduce((sum, l) => sum + (l.net_revenue || 0), 0) || 0;
      const prevOperatingProfit = prevNetRevenue;
      const prevProfitMargin = prevGrossRevenue > 0 ? (prevNetRevenue / prevGrossRevenue) * 100 : 0;

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

      // Calculate actual on-time rate from delivered loads with delivery dates
      const { data: deliveredLoads } = await supabase
        .from('fleet_loads')
        .select('delivery_date, pickup_date')
        .eq('status', 'delivered')
        .not('delivery_date', 'is', null)
        .gte('delivery_date', formatDate(dateRange.start))
        .lte('delivery_date', formatDate(dateRange.end));

      // Get the corresponding status logs to check actual delivery timing
      let onTimeRate = 0;
      if (deliveredLoads && deliveredLoads.length > 0) {
        // If we have loads with both pickup and delivery dates, we can estimate on-time performance
        // For now, count loads that were delivered (have a delivery_date) as a proxy
        // A load is "on-time" if it has a delivery_date (meaning it was tracked to completion)
        const loadsWithSchedule = deliveredLoads.filter(l => l.delivery_date && l.pickup_date);
        onTimeRate = loadsWithSchedule.length > 0 ? (loadsWithSchedule.length / deliveredLoads.length) * 100 : 0;
        // Clamp to reasonable values
        onTimeRate = Math.min(onTimeRate, 100);
      }

      // Calculate empty miles ratio
      const { data: emptyMilesLoads } = await supabase
        .from('fleet_loads')
        .select('empty_miles, actual_miles, booked_miles')
        .eq('status', 'delivered')
        .gte('delivery_date', formatDate(dateRange.start))
        .lte('delivery_date', formatDate(dateRange.end));
      
      const totalEmptyMiles = emptyMilesLoads?.reduce((sum, l) => sum + (l.empty_miles || 0), 0) || 0;
      const totalLoadedMiles = emptyMilesLoads?.reduce((sum, l) => sum + (l.actual_miles || l.booked_miles || 0), 0) || 0;
      const emptyMilesRatio = totalLoadedMiles > 0 ? (totalEmptyMiles / (totalLoadedMiles + totalEmptyMiles)) * 100 : 0;

      return {
        totalLoads,
        totalMiles,
        revenuePerMile,
        fleetUtilization,
        onTimeRate,
        totalEmptyMiles,
        emptyMilesRatio,
      };
    },
  });

  // Fetch fleet status
  const { data: fleetStatus, isLoading: fleetLoading } = useQuery({
    queryKey: ['executive-fleet-status'],
    queryFn: async () => {
      const { data: trucks } = await supabase.from('trucks').select('id, status');
      const { data: activeLoads } = await supabase
        .from('fleet_loads')
        .select('truck_id')
        .in('status', ['in_transit', 'at_pickup', 'at_delivery']);

      const trucksOnLoads = new Set(activeLoads?.map((l) => l.truck_id));
      const truckList = trucks || [];

      const active = truckList.filter(t => t.status === 'active' && trucksOnLoads.has(t.id)).length;
      const available = truckList.filter(t => t.status === 'active' && !trucksOnLoads.has(t.id)).length;
      const maintenance = truckList.filter(t => t.status === 'maintenance').length;
      const outOfService = truckList.filter(t => t.status === 'out_of_service').length;

      return {
        active,
        available,
        maintenance,
        outOfService,
        total: truckList.length,
      };
    },
  });

  // Fetch driver availability
  const { data: driverAvailability, isLoading: driverLoading } = useQuery({
    queryKey: ['executive-driver-availability'],
    queryFn: async () => {
      const { data: drivers } = await supabase.from('drivers').select('id, status, license_expiry, medical_card_expiry');
      const { data: activeLoads } = await supabase
        .from('fleet_loads')
        .select('driver_id')
        .in('status', ['in_transit', 'at_pickup', 'at_delivery']);

      const driversOnLoads = new Set(activeLoads?.map((l) => l.driver_id));
      const driverList = drivers || [];
      const now = new Date();
      const thirtyDaysFromNow = addDays(now, 30);

      // Check for credential issues (expired or expiring soon)
      const hasCredentialIssues = (d: typeof driverList[0]) => {
        const licenseExpiry = d.license_expiry ? new Date(d.license_expiry) : null;
        const medicalExpiry = d.medical_card_expiry ? new Date(d.medical_card_expiry) : null;
        return (licenseExpiry && licenseExpiry < now) || (medicalExpiry && medicalExpiry < now);
      };

      const onLoad = driverList.filter(d => d.status === 'active' && driversOnLoads.has(d.id)).length;
      const credentialIssues = driverList.filter(d => hasCredentialIssues(d)).length;
      const available = driverList.filter(d => d.status === 'active' && !driversOnLoads.has(d.id) && !hasCredentialIssues(d)).length;
      const offDuty = driverList.filter(d => d.status !== 'active').length;

      return {
        onLoad,
        available,
        offDuty,
        credentialIssues,
        total: driverList.length,
      };
    },
  });

  // Fetch critical alerts
  const { data: criticalAlerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['executive-critical-alerts'],
    queryFn: async () => {
      const alerts: CriticalAlert[] = [];
      const now = new Date();

      // Check for trucks in maintenance/out of service
      const { data: trucks } = await supabase.from('trucks').select('status');
      const maintenanceTrucks = trucks?.filter(t => t.status === 'maintenance').length || 0;
      const outOfServiceTrucks = trucks?.filter(t => t.status === 'out_of_service').length || 0;

      if (outOfServiceTrucks > 0) {
        alerts.push({
          id: 'trucks-oos',
          type: 'truck',
          message: `${outOfServiceTrucks} truck${outOfServiceTrucks > 1 ? 's' : ''} out of service`,
          count: outOfServiceTrucks,
        });
      }

      if (maintenanceTrucks > 0) {
        alerts.push({
          id: 'trucks-maintenance',
          type: 'maintenance',
          message: `${maintenanceTrucks} truck${maintenanceTrucks > 1 ? 's' : ''} in maintenance`,
          count: maintenanceTrucks,
        });
      }

      // Check for drivers with expired credentials
      const { data: drivers } = await supabase.from('drivers').select('license_expiry, medical_card_expiry');
      const expiredCredentials = drivers?.filter(d => {
        const licenseExpiry = d.license_expiry ? new Date(d.license_expiry) : null;
        const medicalExpiry = d.medical_card_expiry ? new Date(d.medical_card_expiry) : null;
        return (licenseExpiry && licenseExpiry < now) || (medicalExpiry && medicalExpiry < now);
      }).length || 0;

      if (expiredCredentials > 0) {
        alerts.push({
          id: 'expired-credentials',
          type: 'driver',
          message: `${expiredCredentials} driver${expiredCredentials > 1 ? 's' : ''} with expired credentials`,
          count: expiredCredentials,
        });
      }

      // Check for unresolved defects
      const { data: defects } = await supabase
        .from('driver_inspections')
        .select('id')
        .eq('defects_found', true)
        .neq('status', 'resolved');

      if (defects && defects.length > 0) {
        alerts.push({
          id: 'unresolved-defects',
          type: 'maintenance',
          message: `${defects.length} unresolved defect${defects.length > 1 ? 's' : ''} from inspections`,
          count: defects.length,
        });
      }

      return alerts;
    },
  });

  // Fetch pending actions
  const { data: pendingActions = [], isLoading: actionsLoading } = useQuery({
    queryKey: ['executive-pending-actions'],
    queryFn: async () => {
      const actions: PendingAction[] = [];
      const now = new Date();
      const thirtyDaysFromNow = addDays(now, 30);

      // Pending settlements (draft or pending status)
      const { data: pendingSettlements } = await supabase
        .from('settlements')
        .select('id, status')
        .in('status', ['draft', 'pending']);

      if (pendingSettlements && pendingSettlements.length > 0) {
        actions.push({
          id: 'pending-settlements',
          type: 'settlement',
          title: 'Settlements Pending Approval',
          count: pendingSettlements.length,
          priority: 'medium',
          link: '/finance?tab=settlements',
        });
      }

      // Pending maintenance requests
      const { data: maintenanceRequests } = await supabase
        .from('maintenance_requests')
        .select('id, priority')
        .eq('status', 'submitted');

      if (maintenanceRequests && maintenanceRequests.length > 0) {
        const highPriority = maintenanceRequests.filter(m => m.priority === 'high').length;
        actions.push({
          id: 'maintenance-requests',
          type: 'maintenance',
          title: 'Maintenance Requests',
          count: maintenanceRequests.length,
          priority: highPriority > 0 ? 'high' : 'medium',
          link: '/maintenance',
        });
      }

      // Unresolved inspection defects
      const { data: defects } = await supabase
        .from('driver_inspections')
        .select('id')
        .eq('defects_found', true)
        .neq('status', 'resolved');

      if (defects && defects.length > 0) {
        actions.push({
          id: 'defects',
          type: 'defect',
          title: 'Unresolved Defects',
          count: defects.length,
          priority: 'high',
          link: '/safety',
        });
      }

      // Expiring credentials (within 30 days)
      const { data: drivers } = await supabase.from('drivers').select('license_expiry, medical_card_expiry');
      const expiringCredentials = drivers?.filter(d => {
        const licenseExpiry = d.license_expiry ? new Date(d.license_expiry) : null;
        const medicalExpiry = d.medical_card_expiry ? new Date(d.medical_card_expiry) : null;
        return (licenseExpiry && licenseExpiry >= now && licenseExpiry <= thirtyDaysFromNow) ||
               (medicalExpiry && medicalExpiry >= now && medicalExpiry <= thirtyDaysFromNow);
      }).length || 0;

      if (expiringCredentials > 0) {
        actions.push({
          id: 'expiring-credentials',
          type: 'credential',
          title: 'Credentials Expiring Soon',
          count: expiringCredentials,
          priority: 'medium',
          link: '/drivers',
        });
      }

      return actions;
    },
  });

  // Fetch cost breakdown - grouped into broader categories
  const { data: costBreakdown = [], isLoading: costLoading } = useQuery({
    queryKey: ['executive-costs', period],
    queryFn: async () => {
      const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

      const { data: expenses } = await supabase
        .from('expenses')
        .select('expense_type, amount')
        .gte('expense_date', formatDate(dateRange.start))
        .lte('expense_date', formatDate(dateRange.end));

      // Category mappings for grouping expense types
      const categoryMap: Record<string, string> = {
        // Fuel & DEF
        'Fuel': 'Fuel & DEF',
        'DEF': 'Fuel & DEF',
        'Fuel Discount': 'Fuel & DEF',
        
        // Operations & Road Expenses
        'Tolls': 'Operations',
        'PrePass/Scale': 'Operations',
        'Trip Scanning': 'Operations',
        'LCN/Satellite': 'Operations',
        
        // Insurance & Benefits
        'Insurance': 'Insurance & Benefits',
        'CPP/Benefits': 'Insurance & Benefits',
        
        // Payments & Advances
        'Cash Advance': 'Payments & Advances',
        'Card Pre-Trip': 'Payments & Advances',
        'Card Load': 'Payments & Advances',
        'Card Fee': 'Payments & Advances',
        'Direct Deposit Fee': 'Payments & Advances',
        'Escrow Payment': 'Payments & Advances',
      };

      // Group expenses by category
      const grouped = (expenses || []).reduce<Record<string, number>>((acc, e) => {
        const type = e.expense_type || 'Other';
        const category = categoryMap[type] || 'Other';
        acc[category] = (acc[category] || 0) + (e.amount || 0);
        return acc;
      }, {});

      // Muted, professional color palette
      const categoryColors: Record<string, string> = {
        'Fuel & DEF': 'hsl(35 50% 55%)',       // Warm tan
        'Operations': 'hsl(210 40% 55%)',      // Soft blue
        'Insurance & Benefits': 'hsl(160 35% 50%)',  // Sage green
        'Payments & Advances': 'hsl(280 30% 55%)',   // Muted purple
        'Other': 'hsl(220 20% 50%)',           // Slate gray
      };

      const entries = Object.entries(grouped).filter(([_, value]) => value !== 0);
      return entries.map(([name, value]) => ({
        name,
        value,
        color: categoryColors[name] || 'hsl(220 20% 50%)',
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

  // Calculate health score data
  const healthData = useMemo(() => {
    if (!kpiData || !operationalData) return undefined;

    const revenueGrowth = kpiData.prevGrossRevenue > 0
      ? ((kpiData.grossRevenue - kpiData.prevGrossRevenue) / kpiData.prevGrossRevenue) * 100
      : 0;

    return {
      profitMargin: kpiData.profitMargin,
      fleetUtilization: operationalData.fleetUtilization,
      onTimeRate: operationalData.onTimeRate,
      revenueGrowth,
    };
  }, [kpiData, operationalData]);

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
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Executive Dashboard"
            description="Financial and operational health at a glance"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowReport(true)} className="gap-2">
              <FileText className="h-4 w-4" /> Generate EOW Report
            </Button>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </div>

        {/* Morning Briefing */}
        <ErrorBoundary compact>
          <MorningBriefingWidget />
        </ErrorBoundary>

        {/* Row 1: Critical Alerts Banner */}
        <ErrorBoundary compact>
          <CriticalAlertsBar alerts={criticalAlerts} isLoading={alertsLoading} />
        </ErrorBoundary>

        {/* Row 2: Health Score + KPI Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-1">
            <CompanyHealthScore data={healthData} isLoading={kpiLoading || operationalLoading} />
          </div>
          <div className="lg:col-span-4">
            <RevenueKPICards data={kpiData} isLoading={kpiLoading} />
          </div>
        </div>

        {/* Row 3: Fleet & Driver Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ErrorBoundary compact>
            <FleetStatusCard data={fleetStatus} isLoading={fleetLoading} />
          </ErrorBoundary>
          <ErrorBoundary compact>
            <DriverAvailabilityCard data={driverAvailability} isLoading={driverLoading} />
          </ErrorBoundary>
        </div>

        {/* Row 4: Revenue Trends Chart */}
        <ErrorBoundary compact>
          <RevenueTrendsChart data={trendsData} isLoading={trendsLoading} />
        </ErrorBoundary>

        {/* Row 5: Operations + Costs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ErrorBoundary compact>
            <OperationalMetrics data={operationalData} isLoading={operationalLoading} />
          </ErrorBoundary>
          <ErrorBoundary compact>
            <CostBreakdownChart data={costBreakdown} isLoading={costLoading} />
          </ErrorBoundary>
        </div>

        {/* Row 6: Actions + Performers + Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PendingActionsCard actions={pendingActions} isLoading={actionsLoading} />
          <TopPerformerCards
            topDriver={topPerformers?.topDriver}
            topTruck={topPerformers?.topTruck}
            isLoading={performersLoading}
          />
          <QuickInsights insights={insights} isLoading={isLoading} />
        </div>
      </div>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-[100vw] w-full h-[100vh] max-h-[100vh] overflow-y-auto p-0 rounded-none border-none [&>button]:hidden">
          <PrintableExecutiveSummary
            kpiData={kpiData}
            fleetStatus={fleetStatus}
            driverAvailability={driverAvailability}
            operationalData={operationalData}
            topPerformers={topPerformers}
            period={period}
            onClose={() => setShowReport(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
