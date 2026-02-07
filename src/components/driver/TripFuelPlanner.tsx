import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { geocodeLocationAsync } from '@/lib/geocoding';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Fuel, RefreshCw, MapPin, Clock, DollarSign, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface FuelStop {
  id?: string;
  name: string;
  chain: string | null;
  latitude: number;
  longitude: number;
  state: string;
  city: string | null;
  diesel_price: number | null;
  lcapp_discount: number | null;
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
}

// Fuel stop marker icons
const lcappStopIcon = L.divIcon({
  html: `<div style="width:24px;height:24px;background:#22c55e;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="14" height="14">
      <path d="M18 10a1 1 0 0 1-1-1V6.82l-.4.4A1 1 0 0 1 15.18 5.8L18 3l2.82 2.82a1 1 0 0 1-1.42 1.42l-.4-.4V9a1 1 0 0 1-1 1ZM3.5 22v-2l2-2v-4.77a4 4 0 0 1 1.17-2.83L9 8.06V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3.06l2.33 2.34A4 4 0 0 1 17.5 13.23V18l2 2v2h-16Z"/>
    </svg>
  </div>`,
  className: 'custom-fuel-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const regularStopIcon = L.divIcon({
  html: `<div style="width:24px;height:24px;background:#3b82f6;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="14" height="14">
      <path d="M18 10a1 1 0 0 1-1-1V6.82l-.4.4A1 1 0 0 1 15.18 5.8L18 3l2.82 2.82a1 1 0 0 1-1.42 1.42l-.4-.4V9a1 1 0 0 1-1 1ZM3.5 22v-2l2-2v-4.77a4 4 0 0 1 1.17-2.83L9 8.06V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3.06l2.33 2.34A4 4 0 0 1 17.5 13.23V18l2 2v2h-16Z"/>
    </svg>
  </div>`,
  className: 'custom-fuel-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const originIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#22c55e" width="20" height="20">
      <circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/>
    </svg>
  </div>`,
  className: 'custom-marker',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const destinationIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ef4444" width="20" height="20">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/>
    </svg>
  </div>`,
  className: 'custom-marker',
  iconSize: [20, 20],
  iconAnchor: [10, 20],
});

// Auto-fit map bounds
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [points, map]);
  return null;
}

const DEFAULT_MPG = 6.5;

export function TripFuelPlanner({ driverId, origin, destination, bookedMiles }: TripFuelPlannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(true);

  // Geocode origin and destination
  useEffect(() => {
    let cancelled = false;
    setGeocoding(true);

    Promise.all([
      geocodeLocationAsync(origin),
      geocodeLocationAsync(destination),
    ]).then(([o, d]) => {
      if (cancelled) return;
      setOriginCoords(o);
      setDestCoords(d);
      setGeocoding(false);
    }).catch(() => {
      if (!cancelled) setGeocoding(false);
    });

    return () => { cancelled = true; };
  }, [origin, destination]);

  // Fetch fuel stops from edge function
  const { data: fuelData, isLoading: fuelLoading, refetch, isFetching } = useQuery({
    queryKey: ['fuel-stops', driverId, originCoords?.lat, destCoords?.lat],
    queryFn: async () => {
      if (!originCoords || !destCoords) return null;

      const { data, error } = await supabase.functions.invoke('landstar-fuel-stops', {
        body: {
          driver_id: driverId,
          origin_lat: originCoords.lat,
          origin_lng: originCoords.lng,
          dest_lat: destCoords.lat,
          dest_lng: destCoords.lng,
          corridor_miles: 50,
        },
      });

      if (error) throw error;
      return data as {
        fuel_stops: FuelStop[];
        source: string;
        fetched_at: string;
        filtered_count: number;
      };
    },
    enabled: !!originCoords && !!destCoords,
    staleTime: 30 * 60 * 1000, // 30 min
    retry: 1,
  });

  const fuelStops = fuelData?.fuel_stops || [];
  const tripMiles = bookedMiles || 500;
  const estimatedGallons = parseFloat((tripMiles / DEFAULT_MPG).toFixed(1));

  // Trip cost calculations
  const costEstimate = useMemo(() => {
    if (fuelStops.length === 0) return null;

    const cheapest = fuelStops[0];
    const avgPrice = fuelStops.reduce((sum, s) => sum + (s.net_price || s.diesel_price || 0), 0) / fuelStops.length;
    const lcappStops = fuelStops.filter(s => s.lcapp_discount && s.lcapp_discount > 0);
    const avgLcappSaving = lcappStops.length > 0
      ? lcappStops.reduce((sum, s) => sum + (s.lcapp_discount || 0), 0) / lcappStops.length
      : 0;

    return {
      cheapestPrice: cheapest.net_price || cheapest.diesel_price || 0,
      cheapestName: cheapest.name,
      avgRoutePrice: parseFloat(avgPrice.toFixed(2)),
      estimatedCheapestCost: parseFloat(((cheapest.net_price || cheapest.diesel_price || 0) * estimatedGallons).toFixed(2)),
      estimatedAvgCost: parseFloat((avgPrice * estimatedGallons).toFixed(2)),
      potentialSavings: parseFloat((avgLcappSaving * estimatedGallons).toFixed(2)),
      lcappStopCount: lcappStops.length,
    };
  }, [fuelStops, estimatedGallons]);

  // Map bounds points
  const mapPoints = useMemo((): [number, number][] => {
    const points: [number, number][] = [];
    if (originCoords) points.push([originCoords.lat, originCoords.lng]);
    if (destCoords) points.push([destCoords.lat, destCoords.lng]);
    fuelStops.forEach(s => points.push([s.latitude, s.longitude]));
    return points;
  }, [originCoords, destCoords, fuelStops]);

  const handleRefresh = () => {
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
    return null; // Can't show planner without geocoded locations
  }

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
          {fuelData?.source === 'landstar' && (
            <Badge variant="outline" className="text-xs border-primary/50 text-primary ml-1">
              LCAPP Live
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Map */}
        <div className="h-48 w-full rounded-lg overflow-hidden border border-border">
          <MapContainer
            center={[originCoords.lat, originCoords.lng]}
            zoom={5}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
            className="z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBounds points={mapPoints} />

            {/* Route line */}
            <Polyline
              positions={[
                [originCoords.lat, originCoords.lng],
                [destCoords.lat, destCoords.lng],
              ]}
              pathOptions={{ color: 'hsl(var(--primary))', weight: 3, opacity: 0.7, dashArray: '8,8' }}
            />

            {/* Origin & Destination */}
            <Marker position={[originCoords.lat, originCoords.lng]} icon={originIcon} />
            <Marker position={[destCoords.lat, destCoords.lng]} icon={destinationIcon} />

            {/* Fuel stop markers */}
            {fuelStops.map((stop, i) => (
              <Marker
                key={`${stop.name}-${i}`}
                position={[stop.latitude, stop.longitude]}
                icon={stop.lcapp_discount ? lcappStopIcon : regularStopIcon}
              >
                <Popup>
                  <div className="text-sm min-w-[180px]">
                    <p className="font-semibold">{stop.name}</p>
                    {stop.chain && <p className="text-xs text-gray-500">{stop.chain}</p>}
                    <div className="mt-1 space-y-0.5">
                      <p>Diesel: <span className="font-medium">${stop.diesel_price?.toFixed(2)}/gal</span></p>
                      {stop.lcapp_discount && stop.lcapp_discount > 0 && (
                        <p className="text-green-600 font-medium">
                          LCAPP: -${stop.lcapp_discount.toFixed(2)}/gal → ${stop.net_price?.toFixed(2)}
                        </p>
                      )}
                      {stop.distance_from_route !== undefined && (
                        <p className="text-xs text-gray-500">
                          {stop.distance_from_route.toFixed(0)} mi off route
                        </p>
                      )}
                    </div>
                    {stop.amenities && stop.amenities.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {stop.amenities.join(' · ')}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

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
          <span className="ml-auto">{fuelStops.length} stops found</span>
        </div>

        {/* Cost Estimate Summary */}
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
            {costEstimate.potentialSavings > 0 && (
              <div className="flex items-center justify-between text-primary">
                <span className="text-sm flex items-center gap-1">
                  <TrendingDown className="h-3.5 w-3.5" />
                  LCAPP savings
                </span>
                <span className="text-sm font-semibold">
                  ~${costEstimate.potentialSavings.toFixed(0)} on this trip
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
                        <span className="font-medium truncate">{stop.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pl-3.5">
                        <span>{stop.city}, {stop.state}</span>
                        {stop.distance_from_route !== undefined && (
                          <span>· {stop.distance_from_route.toFixed(0)} mi off route</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-semibold">
                        ${(stop.net_price || stop.diesel_price || 0).toFixed(2)}
                      </p>
                      {stop.lcapp_discount && stop.lcapp_discount > 0 && (
                        <p className="text-xs text-primary">
                          -${stop.lcapp_discount.toFixed(2)} LCAPP
                        </p>
                      )}
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
