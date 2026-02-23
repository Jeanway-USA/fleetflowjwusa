import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { geocodeLocationAsync } from '@/lib/geocoding';
import { fetchRouteWithWaypoints } from '@/lib/routing';
import { parseIntermediateStops, type IntermediateStop } from '@/lib/parseIntermediateStops';
import { getIftaTaxCredit } from '@/lib/ifta-tax-rates';
import { Fuel, RefreshCw, Clock, DollarSign, TrendingDown, ChevronDown, ChevronUp, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ExpandableMap } from '@/components/shared/ExpandableMap';
import { FuelPlannerMap } from './fuel-planner/FuelPlannerMap';

interface FuelStop {
  id?: string;
  name: string;
  brand?: string | null;
  store_number?: string | null;
  address?: string | null;
  chain: string | null;
  latitude: number;
  longitude: number;
  state: string;
  city: string | null;
  diesel_price: number | null;
  lcapp_discount: number | null;
  ifta_tax_credit: number | null;
  net_price: number | null;
  amenities: string[] | null;
  source: string;
  fetched_at: string;
  distance_from_route?: number;
  distance_from_origin?: number;
}

interface TripFuelPlannerProps {
  driverId: string;
  origin: string;
  destination: string;
  bookedMiles: number | null;
  notes?: string | null;
}

interface GeocodedStop {
  coords: { lat: number; lng: number };
  stop: IntermediateStop;
}

const DEFAULT_MPG = 6.5;

export function TripFuelPlanner({ driverId, origin, destination, bookedMiles, notes }: TripFuelPlannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(true);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [geocodedStops, setGeocodedStops] = useState<GeocodedStop[]>([]);
  const forceRefreshRef = useRef(false);
  const [routeTimedOut, setRouteTimedOut] = useState(false);

  // Parse intermediate stops from notes
  const intermediateStops = useMemo(() => parseIntermediateStops(notes || null), [notes]);

  // Geocode origin, destination, intermediate stops, then fetch route with waypoints
  useEffect(() => {
    let cancelled = false;
    setGeocoding(true);

    Promise.all([
      geocodeLocationAsync(origin),
      geocodeLocationAsync(destination),
    ]).then(async ([o, d]) => {
      if (cancelled) return;
      setOriginCoords(o);
      setDestCoords(d);

      const stopsGeocoded: GeocodedStop[] = [];
      for (const stop of intermediateStops) {
        if (cancelled) return;
        try {
          const coords = await geocodeLocationAsync(stop.address);
          if (coords) {
            stopsGeocoded.push({ coords, stop });
          }
        } catch {
          // Skip failed geocode
        }
      }
      if (!cancelled) setGeocodedStops(stopsGeocoded);

      if (o && d) {
        const waypoints = stopsGeocoded.map(s => s.coords);
        const route = await fetchRouteWithWaypoints(o, waypoints, d);
        if (!cancelled) setRouteCoords(route);
      }

      if (!cancelled) setGeocoding(false);
    }).catch(() => {
      if (!cancelled) setGeocoding(false);
    });

    return () => { cancelled = true; };
  }, [origin, destination, intermediateStops]);

  // Timeout fallback: allow query without routeCoords after 10s (OSRM outage)
  useEffect(() => {
    if (routeCoords || routeTimedOut) return;
    const timer = setTimeout(() => setRouteTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [routeCoords, routeTimedOut]);

  const routeReady = !!routeCoords || routeTimedOut;

  // Fetch fuel stops from edge function
  const { data: fuelData, isLoading: fuelLoading, refetch, isFetching } = useQuery({
    queryKey: ['fuel-stops', driverId, originCoords?.lat, destCoords?.lat, geocodedStops.length, routeCoords?.length ?? 0],
    queryFn: async () => {
      if (!originCoords || !destCoords) return null;

      const shouldForce = forceRefreshRef.current;
      forceRefreshRef.current = false;

      // Send route polyline for precise corridor filtering
      const routePolyline = routeCoords && routeCoords.length > 0
        ? routeCoords.filter((_, i) => i % 20 === 0 || i === routeCoords.length - 1)
        : undefined;

      const payload = {
        driver_id: driverId,
        origin_lat: originCoords.lat,
        origin_lng: originCoords.lng,
        dest_lat: destCoords.lat,
        dest_lng: destCoords.lng,
        waypoints: geocodedStops.map(s => ({ lat: s.coords.lat, lng: s.coords.lng })),
        route_polyline: routePolyline,
        corridor_miles: 35,
        force_refresh: shouldForce,
        booked_miles: bookedMiles,
      };

      // Estimate route distance from polyline
      let polylineDistance = 0;
      if (routePolyline && routePolyline.length > 1) {
        for (let i = 1; i < routePolyline.length; i++) {
          const [lat1, lng1] = routePolyline[i - 1];
          const [lat2, lng2] = routePolyline[i];
          const R = 3959;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLng = (lng2 - lng1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          polylineDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
      }

      console.log('[FuelPlanner] Invoking landstar-fuel-stops with payload:', {
        origin: `${payload.origin_lat},${payload.origin_lng}`,
        dest: `${payload.dest_lat},${payload.dest_lng}`,
        polylinePoints: routePolyline?.length ?? 0,
        estimatedRouteMiles: Math.round(polylineDistance),
        waypoints: payload.waypoints.length,
        corridor_miles: payload.corridor_miles,
      });

      const { data, error } = await supabase.functions.invoke('landstar-fuel-stops', {
        body: payload,
      });

      if (error) throw error;

      // Enrich with client-side IFTA credits if missing from response
      const stops = (data?.fuel_stops || []).map((s: FuelStop) => ({
        ...s,
        ifta_tax_credit: s.ifta_tax_credit ?? getIftaTaxCredit(s.state),
      }));

      return {
        ...data,
        fuel_stops: stops,
      } as {
        fuel_stops: FuelStop[];
        source: string;
        fetched_at: string;
        filtered_count: number;
        projected_savings?: { cheapest_net: number; avg_price: number; savings_per_gallon: number; total_savings: number };
      };
    },
    enabled: !!originCoords && !!destCoords && !geocoding && routeReady,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const fuelStops = fuelData?.fuel_stops || [];
  const tripMiles = bookedMiles || 500;
  const estimatedGallons = parseFloat((tripMiles / DEFAULT_MPG).toFixed(1));

  // Trip cost calculations
  const costEstimate = useMemo(() => {
    if (fuelStops.length === 0) return null;

    const cheapest = fuelStops.reduce((min, s) =>
      (s.net_price || s.diesel_price || 999) < (min.net_price || min.diesel_price || 999) ? s : min
    , fuelStops[0]);
    const avgPrice = fuelStops.reduce((sum, s) => sum + (s.net_price || s.diesel_price || 0), 0) / fuelStops.length;
    const lcappStops = fuelStops.filter(s => s.lcapp_discount && s.lcapp_discount > 0);
    const avgLcappSaving = lcappStops.length > 0
      ? lcappStops.reduce((sum, s) => sum + (s.lcapp_discount || 0), 0) / lcappStops.length
      : 0;

    // IFTA credit calculations
    const avgIftaCredit = fuelStops.reduce((sum, s) => sum + (s.ifta_tax_credit || 0), 0) / fuelStops.length;
    const totalIftaSavings = parseFloat((avgIftaCredit * estimatedGallons).toFixed(2));

    return {
      cheapestPrice: cheapest.net_price || cheapest.diesel_price || 0,
      cheapestName: cheapest.name,
      avgRoutePrice: parseFloat(avgPrice.toFixed(2)),
      estimatedCheapestCost: parseFloat(((cheapest.net_price || cheapest.diesel_price || 0) * estimatedGallons).toFixed(2)),
      estimatedAvgCost: parseFloat((avgPrice * estimatedGallons).toFixed(2)),
      potentialLcappSavings: parseFloat((avgLcappSaving * estimatedGallons).toFixed(2)),
      avgIftaCredit: parseFloat(avgIftaCredit.toFixed(3)),
      totalIftaSavings,
      lcappStopCount: lcappStops.length,
    };
  }, [fuelStops, estimatedGallons]);

  // Map bounds points
  const mapPoints = useMemo((): [number, number][] => {
    const points: [number, number][] = routeCoords && routeCoords.length > 1
      ? [...routeCoords]
      : [
          ...(originCoords ? [[originCoords.lat, originCoords.lng] as [number, number]] : []),
          ...(destCoords ? [[destCoords.lat, destCoords.lng] as [number, number]] : []),
          ...geocodedStops.map(s => [s.coords.lat, s.coords.lng] as [number, number]),
        ];
    fuelStops.forEach(s => points.push([s.latitude, s.longitude]));
    return points;
  }, [originCoords, destCoords, fuelStops, routeCoords, geocodedStops]);

  const handleRefresh = () => {
    forceRefreshRef.current = true;
    refetch();
    toast.info('Refreshing fuel prices...');
  };

  const isLoading = geocoding || fuelLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            Fuel Trip Planner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full rounded-lg mb-3" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!originCoords || !destCoords) {
    return null;
  }

  const routePositions: [number, number][] = routeCoords && routeCoords.length > 0
    ? routeCoords
    : [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            Fuel Trip Planner
          </CardTitle>
          <div className="flex items-center gap-2">
            {fuelData?.fetched_at && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(fuelData.fetched_at), { addSuffix: true })}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{tripMiles.toLocaleString()} mi</span>
          <span>·</span>
          <span>~{estimatedGallons} gal needed</span>
          {intermediateStops.length > 0 && (
            <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 ml-1">
              {intermediateStops.length} stops
            </Badge>
          )}
          {fuelData?.source === 'landstar' && (
            <Badge variant="outline" className="text-xs border-primary/50 text-primary ml-1">
              LCAPP Live
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Map with expand capability */}
        <ExpandableMap
          renderMap={({ isExpanded }) => (
            <FuelPlannerMap
              isExpanded={isExpanded}
              originCoords={originCoords}
              destCoords={destCoords}
              routePositions={routePositions}
              mapPoints={mapPoints}
              fuelStops={fuelStops}
              geocodedStops={geocodedStops}
            />
          )}
          title={`Fuel Plan: ${origin} → ${destination}`}
        />

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-primary inline-block" />
            LCAPP Partner
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-accent inline-block" />
            Other Stop
          </span>
          {geocodedStops.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
              Waypoint
            </span>
          )}
          <span className="ml-auto">{fuelStops.length} stops found</span>
        </div>

        {/* Cost Estimate Summary */}
        {/* Projected Savings from backend */}
        {fuelData?.projected_savings && fuelData.projected_savings.total_savings > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4" />
                Projected Fuel Savings
              </span>
              <span className="text-lg font-bold text-primary">
                ${fuelData.projected_savings.total_savings.toFixed(0)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Best stop at ${fuelData.projected_savings.cheapest_net.toFixed(2)}/gal vs ${fuelData.projected_savings.avg_price.toFixed(2)} national avg
              {' '}(${fuelData.projected_savings.savings_per_gallon.toFixed(2)}/gal × ~{estimatedGallons} gal)
            </p>
          </div>
        )}

        {costEstimate && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                Best price
              </span>
              <span className="text-sm font-semibold text-primary">
                ${costEstimate.cheapestPrice.toFixed(2)}/gal
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Est. fuel cost</span>
              <span className="text-sm font-semibold">
                ${costEstimate.estimatedCheapestCost.toFixed(0)} – ${costEstimate.estimatedAvgCost.toFixed(0)}
              </span>
            </div>
            {costEstimate.potentialLcappSavings > 0 && (
              <div className="flex items-center justify-between text-primary">
                <span className="text-sm flex items-center gap-1">
                  <TrendingDown className="h-3.5 w-3.5" />
                  LCAPP savings
                </span>
                <span className="text-sm font-semibold">
                  ~${costEstimate.potentialLcappSavings.toFixed(0)} on this trip
                </span>
              </div>
            )}
            {costEstimate.totalIftaSavings > 0 && (
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                <span className="text-sm flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5" />
                  IFTA tax credit
                </span>
                <span className="text-sm font-semibold">
                  ~${costEstimate.totalIftaSavings.toFixed(0)} avg credit
                  <span className="text-xs font-normal ml-1 text-muted-foreground">
                    (${costEstimate.avgIftaCredit.toFixed(2)}/gal)
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Expandable Fuel Stops List */}
        {fuelStops.length > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Hide stops
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  View all {fuelStops.length} stops
                </>
              )}
            </Button>

            {expanded && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {fuelStops.map((stop, i) => (
                  <div
                    key={`${stop.name}-${i}`}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            stop.lcapp_discount ? 'bg-primary' : 'bg-accent'
                          }`}
                        />
                        <span className="font-medium truncate">
                          {stop.brand && stop.store_number
                            ? `${stop.name} - Store #${stop.store_number}`
                            : stop.name}
                        </span>
                      </div>
                      <div className="flex flex-col text-xs text-muted-foreground pl-3.5">
                        <div className="flex items-center gap-2">
                          <span>{stop.city}, {stop.state}</span>
                          {stop.distance_from_route !== undefined && (
                            <span>· {stop.distance_from_route.toFixed(0)} mi off route</span>
                          )}
                        </div>
                        {stop.address && (
                          <span className="truncate">{stop.address}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-semibold">
                        ${(stop.net_price || stop.diesel_price || 0).toFixed(2)}
                      </p>
                      <div className="flex flex-col items-end">
                        {stop.lcapp_discount && stop.lcapp_discount > 0 && (
                          <p className="text-xs text-primary">
                            -${stop.lcapp_discount.toFixed(2)} LCAPP
                          </p>
                        )}
                        {stop.ifta_tax_credit && stop.ifta_tax_credit > 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            -${stop.ifta_tax_credit.toFixed(2)} IFTA
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {fuelStops.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No fuel stops found along this route. Try refreshing or check a wider corridor.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
