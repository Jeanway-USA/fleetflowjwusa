import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Truck, 
  Route, 
  DollarSign, 
  Calendar,
  CheckCircle,
  Clock,
  TrendingUp,
  Package,
  Gauge,
  Fuel,
  Droplets
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfYear, endOfYear, startOfMonth, endOfMonth, parseISO } from 'date-fns';

type PeriodType = 'weekly' | 'monthly' | 'annual';

export default function DriverStats() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<PeriodType>('weekly');

  // Get date range based on period
  const getDateRange = (periodType: PeriodType) => {
    const now = new Date();
    switch (periodType) {
      case 'weekly':
        return {
          start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      case 'monthly':
        return {
          start: format(startOfMonth(now), 'yyyy-MM-dd'),
          end: format(endOfMonth(now), 'yyyy-MM-dd'),
        };
      case 'annual':
        return {
          start: format(startOfYear(now), 'yyyy-MM-dd'),
          end: format(endOfYear(now), 'yyyy-MM-dd'),
        };
    }
  };

  const dateRange = getDateRange(period);

  // Fetch driver record
  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: ['driver-stats-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch assigned truck
  const { data: assignedTruck } = useQuery({
    queryKey: ['driver-stats-truck', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('current_driver_id', driver?.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  // Fetch assigned trailer
  const { data: assignedTrailer } = useQuery({
    queryKey: ['driver-stats-trailer', driver?.id],
    queryFn: async () => {
      // Get most recent trailer assignment
      const { data, error } = await supabase
        .from('trailer_assignments')
        .select('*, trailers(*)')
        .eq('driver_id', driver?.id)
        .is('end_date', null)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data?.trailers;
    },
    enabled: !!driver?.id,
  });

  // Fetch delivered loads for the period
  const { data: periodLoads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ['driver-stats-loads', driver?.id, dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, load_accessorials(*)')
        .eq('driver_id', driver?.id)
        .eq('status', 'delivered')
        .gte('delivery_date', dateRange.start)
        .lte('delivery_date', dateRange.end);
      if (error) throw error;
      return data || [];
    },
    enabled: !!driver?.id,
  });

  // Fetch fuel purchases for the period
  const { data: fuelPurchases = [] } = useQuery({
    queryKey: ['driver-stats-fuel', driver?.id, dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_purchases')
        .select('gallons, total_cost, price_per_gallon')
        .eq('driver_id', driver?.id)
        .gte('purchase_date', dateRange.start)
        .lte('purchase_date', dateRange.end);
      if (error) throw error;
      return data || [];
    },
    enabled: !!driver?.id,
  });

  // Fetch all-time stats for comparison
  const { data: allTimeLoads = [] } = useQuery({
    queryKey: ['driver-stats-alltime', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('actual_miles, booked_miles, empty_miles, delivery_date, pickup_date, delivery_time, pickup_time')
        .eq('driver_id', driver?.id)
        .eq('status', 'delivered');
      if (error) throw error;
      return data || [];
    },
    enabled: !!driver?.id,
  });

  // Calculate statistics
  const calculateStats = () => {
    let totalLoadedMiles = 0;
    let totalEmptyMiles = 0;
    let totalEarnings = 0;
    let onTimeDeliveries = 0;
    let lateDeliveries = 0;

    periodLoads.forEach((load: any) => {
      // Miles - use actual if available, otherwise booked
      const loadedMiles = (load.actual_miles && load.actual_miles > 0) 
        ? load.actual_miles 
        : (load.booked_miles || 0);
      totalLoadedMiles += loadedMiles;
      totalEmptyMiles += load.empty_miles || 0;

      // Earnings calculation
      const accessorialsTotal = load.load_accessorials?.reduce(
        (sum: number, a: any) => sum + (a.amount || 0), 0
      ) || 0;

      if (driver?.pay_type === 'percentage' && load.rate && driver?.pay_rate) {
        totalEarnings += (load.rate + accessorialsTotal + (load.fuel_surcharge || 0)) * (driver.pay_rate / 100);
      } else if (driver?.pay_type === 'per_mile' && driver?.pay_rate) {
        totalEarnings += loadedMiles * driver.pay_rate;
      }

      // On-time calculation
      if (load.delivery_date) {
        const deliveryDate = parseISO(load.delivery_date + 'T00:00:00');
        const actualDelivery = load.updated_at ? new Date(load.updated_at) : new Date();
        // If delivered on or before delivery_date, count as on-time
        if (actualDelivery <= deliveryDate || actualDelivery.toDateString() === deliveryDate.toDateString()) {
          onTimeDeliveries++;
        } else {
          lateDeliveries++;
        }
      } else {
        onTimeDeliveries++; // If no date specified, assume on-time
      }
    });

    const totalLoads = periodLoads.length;
    const onTimeRate = totalLoads > 0 ? (onTimeDeliveries / totalLoads) * 100 : 100;
    const totalMiles = totalLoadedMiles + totalEmptyMiles;
    const loadedPercentage = totalMiles > 0 ? (totalLoadedMiles / totalMiles) * 100 : 100;

    return {
      totalLoads,
      totalLoadedMiles,
      totalEmptyMiles,
      totalMiles,
      totalEarnings,
      onTimeDeliveries,
      lateDeliveries,
      onTimeRate,
      loadedPercentage,
    };
  };

  const stats = calculateStats();

  // Calculate fuel statistics
  const fuelStats = (() => {
    const totalGallons = fuelPurchases.reduce((sum: number, fp: any) => sum + (fp.gallons || 0), 0);
    const totalFuelCost = fuelPurchases.reduce((sum: number, fp: any) => sum + (fp.total_cost || 0), 0);
    const avgPricePerGallon = totalGallons > 0 ? totalFuelCost / totalGallons : 0;
    const mpg = totalGallons > 0 ? stats.totalLoadedMiles / totalGallons : 0;
    const costPerMile = stats.totalLoadedMiles > 0 ? totalFuelCost / stats.totalLoadedMiles : 0;

    let mpgColor = 'text-destructive';
    let mpgLabel = 'Poor';
    if (mpg >= 6.5) {
      mpgColor = 'text-success';
      mpgLabel = 'Good';
    } else if (mpg >= 5.5) {
      mpgColor = 'text-warning';
      mpgLabel = 'Average';
    }

    return { totalGallons, totalFuelCost, avgPricePerGallon, mpg, costPerMile, mpgColor, mpgLabel };
  })();

  const isLoading = driverLoading || loadsLoading;

  if (isLoading) {
    return (
      <>
        <PageHeader title="My Stats" description="Performance metrics and equipment info" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  if (!driver) {
    return (
      <>
        <PageHeader title="My Stats" description="Performance metrics and equipment info" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Driver profile not found. Please contact an administrator.
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My Stats" description="Performance metrics and equipment info" />

      <div className="space-y-6">
        {/* Equipment Assignment Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Truck className="h-5 w-5" />
              My Equipment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Truck Info */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">Truck</Badge>
                  {assignedTruck ? (
                    <span className="font-mono font-semibold">#{assignedTruck.unit_number}</span>
                  ) : (
                    <span className="text-muted-foreground">Not Assigned</span>
                  )}
                </div>
                {assignedTruck && (
                  <div className="space-y-1 text-sm">
                    <p className="text-muted-foreground">
                      {assignedTruck.year} {assignedTruck.make} {assignedTruck.model}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      VIN: {assignedTruck.vin}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Plate: {assignedTruck.license_plate} ({assignedTruck.license_plate_state})
                    </p>
                  </div>
                )}
              </div>

              {/* Trailer Info */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">Trailer</Badge>
                  {assignedTrailer ? (
                    <span className="font-mono font-semibold">#{assignedTrailer.unit_number}</span>
                  ) : (
                    <span className="text-muted-foreground">Not Assigned</span>
                  )}
                </div>
                {assignedTrailer && (
                  <div className="space-y-1 text-sm">
                    <p className="text-muted-foreground">
                      {assignedTrailer.trailer_type}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      VIN: {assignedTrailer.vin || 'N/A'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Period Selector */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Performance</h2>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <TabsList>
              <TabsTrigger value="weekly">This Week</TabsTrigger>
              <TabsTrigger value="monthly">This Month</TabsTrigger>
              <TabsTrigger value="annual">This Year</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Loads */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Package className="h-4 w-4" />
                <span className="text-sm">Loads Delivered</span>
              </div>
              <p className="text-3xl font-bold">{stats.totalLoads}</p>
            </CardContent>
          </Card>

          {/* Total Earnings */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm">Earnings</span>
              </div>
              <p className="text-3xl font-bold text-success">
                ${stats.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </CardContent>
          </Card>

          {/* On-Time Rate */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">On-Time Rate</span>
              </div>
              <p className="text-3xl font-bold">{stats.onTimeRate.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.onTimeDeliveries} on-time / {stats.lateDeliveries} late
              </p>
            </CardContent>
          </Card>

          {/* Total Miles */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Route className="h-4 w-4" />
                <span className="text-sm">Total Miles</span>
              </div>
              <p className="text-3xl font-bold">{stats.totalMiles.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Mileage Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gauge className="h-5 w-5" />
              Mileage Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 bg-success/10 rounded-lg border border-success/20">
                <p className="text-sm text-muted-foreground mb-1">Loaded Miles</p>
                <p className="text-2xl font-bold text-success">
                  {stats.totalLoadedMiles.toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-warning/10 rounded-lg border border-warning/20">
                <p className="text-sm text-muted-foreground mb-1">Empty Miles (Deadhead)</p>
                <p className="text-2xl font-bold text-warning">
                  {stats.totalEmptyMiles.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Utilization Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Loaded Percentage</span>
                <span className="font-medium">{stats.loadedPercentage.toFixed(1)}%</span>
              </div>
              <Progress value={stats.loadedPercentage} className="h-3" />
              <p className="text-xs text-muted-foreground">
                Higher loaded percentage means more efficient routing and less deadhead
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Fuel & Efficiency */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Fuel className="h-5 w-5" />
              Fuel &amp; Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fuelPurchases.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No fuel purchases recorded for this period
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Droplets className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Total Gallons</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {fuelStats.totalGallons.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Fuel Cost</span>
                    </div>
                    <p className="text-2xl font-bold">
                      ${fuelStats.totalFuelCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg border ${
                    fuelStats.mpg >= 6.5 ? 'bg-success/10 border-success/20' :
                    fuelStats.mpg >= 5.5 ? 'bg-warning/10 border-warning/20' :
                    'bg-destructive/10 border-destructive/20'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Gauge className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Avg MPG</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className={`text-2xl font-bold ${fuelStats.mpgColor}`}>
                        {fuelStats.mpg.toFixed(1)}
                      </p>
                      <span className={`text-xs font-medium ${fuelStats.mpgColor}`}>
                        {fuelStats.mpgLabel}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Route className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Cost/Mile</span>
                    </div>
                    <p className="text-2xl font-bold">
                      ${fuelStats.costPerMile.toFixed(2)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  MPG is calculated from loaded miles ÷ gallons purchased. Target: 6.5+ MPG for semi-trucks.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Period Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              {period === 'weekly' ? 'This Week' : period === 'monthly' ? 'This Month' : 'This Year'} Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Calendar className="h-4 w-4" />
              <span>
                {format(parseISO(dateRange.start + 'T00:00:00'), 'MMM d, yyyy')} — {format(parseISO(dateRange.end + 'T00:00:00'), 'MMM d, yyyy')}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Avg per Load</p>
                <p className="font-semibold">
                  {stats.totalLoads > 0 
                    ? `$${(stats.totalEarnings / stats.totalLoads).toFixed(0)}` 
                    : '-'}
                </p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Avg Miles/Load</p>
                <p className="font-semibold">
                  {stats.totalLoads > 0 
                    ? Math.round(stats.totalLoadedMiles / stats.totalLoads).toLocaleString() 
                    : '-'}
                </p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">$/Mile</p>
                <p className="font-semibold">
                  {stats.totalLoadedMiles > 0 
                    ? `$${(stats.totalEarnings / stats.totalLoadedMiles).toFixed(2)}` 
                    : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
