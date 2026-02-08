import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Truck, Navigation, Radio } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeLocationAsync, interpolatePosition, getProgressFromStatus } from '@/lib/geocoding';
import { fetchRoutesBatch } from '@/lib/routing';
import { parseIntermediateStops, type IntermediateStop } from '@/lib/parseIntermediateStops';
import { ExpandableMap } from '@/components/shared/ExpandableMap';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const createIcon = (color: string, iconType: 'truck' | 'truck-live' | 'origin' | 'destination') => {
  const svgIcon = iconType === 'truck' || iconType === 'truck-live'
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="24" height="24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
    : iconType === 'origin'
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="20" height="20"><circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="20" height="20"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/></svg>`;

  const pulseRing = iconType === 'truck-live' 
    ? `<span class="absolute -inset-1 rounded-full bg-green-500 opacity-75 animate-ping"></span>`
    : '';

  return L.divIcon({
    html: `<div class="relative flex items-center justify-center" style="width: ${iconType.startsWith('truck') ? 32 : 24}px; height: ${iconType.startsWith('truck') ? 32 : 24}px;">${pulseRing}${svgIcon}</div>`,
    className: 'custom-marker',
    iconSize: [iconType.startsWith('truck') ? 32 : 24, iconType.startsWith('truck') ? 32 : 24],
    iconAnchor: [iconType.startsWith('truck') ? 16 : 12, iconType.startsWith('truck') ? 16 : 12],
    popupAnchor: [0, -16],
  });
};

const truckIcon = createIcon('#3b82f6', 'truck');
const truckLiveIcon = createIcon('#22c55e', 'truck-live');
const originIcon = createIcon('#22c55e', 'origin');
const destinationIcon = createIcon('#ef4444', 'destination');

const waypointIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f59e0b" width="18" height="18">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/>
    </svg>
  </div>`,
  className: 'custom-marker',
  iconSize: [18, 18],
  iconAnchor: [9, 18],
  popupAnchor: [0, -14],
});

interface DriverLocation {
  driver_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  updated_at: string;
  is_sharing: boolean;
}

interface LoadWithLocation {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  driver_id: string | null;
  notes: string | null;
  driver: { first_name: string; last_name: string } | null;
  truck: { unit_number: string } | null;
  originCoords: { lat: number; lng: number } | null;
  destCoords: { lat: number; lng: number } | null;
  truckCoords: { lat: number; lng: number } | null;
  isLiveLocation: boolean;
  stopCoords: { lat: number; lng: number; stop: IntermediateStop }[];
}

// Determine if a location record represents a live GPS signal
function isLocationLive(loc: DriverLocation): boolean {
  if (!loc.is_sharing) return false;
  const updatedAt = new Date(loc.updated_at);
  const now = new Date();
  const minutesAgo = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
  return minutesAgo < 10;
}

// Component to fit map bounds (includes intermediate stop coords)
function FitBounds({ loads }: { loads: LoadWithLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (loads.length === 0) {
      map.setView([39.8283, -98.5795], 4);
      return;
    }

    const allCoords: [number, number][] = [];
    loads.forEach(load => {
      if (load.originCoords) allCoords.push([load.originCoords.lat, load.originCoords.lng]);
      if (load.destCoords) allCoords.push([load.destCoords.lat, load.destCoords.lng]);
      if (load.truckCoords) allCoords.push([load.truckCoords.lat, load.truckCoords.lng]);
      load.stopCoords.forEach(sc => allCoords.push([sc.lat, sc.lng]));
    });

    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [loads, map]);

  return null;
}

export function FleetMapView() {
  const queryClient = useQueryClient();
  const [driverLocations, setDriverLocations] = useState<Map<string, DriverLocation>>(new Map());
  const [liveCount, setLiveCount] = useState(0);
  const [geocodedCoords, setGeocodedCoords] = useState<Map<string, { lat: number; lng: number } | null>>(new Map());
  const [routeGeometries, setRouteGeometries] = useState<Map<string, [number, number][]>>(new Map());
  const [routeKeys, setRouteKeys] = useState<Map<string, string>>(new Map());

  // Fetch ALL driver locations (not just recent ones)
  const { data: initialLocations } = useQuery({
    queryKey: ['driver-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('driver_id, latitude, longitude, speed, heading, updated_at, is_sharing');
      
      if (error) throw error;
      return data as DriverLocation[];
    },
  });

  // Initialize driver locations from query
  useEffect(() => {
    if (initialLocations) {
      const locMap = new Map<string, DriverLocation>();
      let live = 0;
      initialLocations.forEach(loc => {
        locMap.set(loc.driver_id, loc);
        if (isLocationLive(loc)) live++;
      });
      setDriverLocations(locMap);
      setLiveCount(live);
    }
  }, [initialLocations]);

  // Subscribe to realtime location updates
  useEffect(() => {
    const channel = supabase
      .channel('driver-locations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setDriverLocations(prev => {
              const next = new Map(prev);
              next.delete((payload.old as any).driver_id);
              let live = 0;
              next.forEach(l => { if (isLocationLive(l)) live++; });
              setLiveCount(live);
              return next;
            });
          } else {
            const newLoc = payload.new as DriverLocation;
            setDriverLocations(prev => {
              const next = new Map(prev);
              next.set(newLoc.driver_id, newLoc);
              let live = 0;
              next.forEach(l => { if (isLocationLive(l)) live++; });
              setLiveCount(live);
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const { data: rawLoads, isLoading } = useQuery({
    queryKey: ['in-transit-loads-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select(`
          id,
          landstar_load_id,
          origin,
          destination,
          status,
          driver_id,
          notes,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name),
          truck:trucks!fleet_loads_truck_id_fkey(unit_number)
        `)
        .eq('status', 'in_transit');
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Parse intermediate stops for each load
  const loadStops = useMemo(() => {
    const map = new Map<string, IntermediateStop[]>();
    if (!rawLoads) return map;
    rawLoads.forEach(load => {
      const stops = parseIntermediateStops(load.notes);
      if (stops.length > 0) map.set(load.id, stops);
    });
    return map;
  }, [rawLoads]);

  // Geocode addresses when loads change (including intermediate stop addresses)
  useEffect(() => {
    if (!rawLoads) return;

    const geocodeAddresses = async () => {
      const addressesToGeocode: string[] = [];
      
      rawLoads.forEach(load => {
        if (!geocodedCoords.has(load.origin)) {
          addressesToGeocode.push(load.origin);
        }
        if (!geocodedCoords.has(load.destination)) {
          addressesToGeocode.push(load.destination);
        }
      });

      // Also geocode intermediate stop addresses
      loadStops.forEach(stops => {
        stops.forEach(stop => {
          if (!geocodedCoords.has(stop.address)) {
            addressesToGeocode.push(stop.address);
          }
        });
      });

      if (addressesToGeocode.length === 0) return;

      const newCoords = new Map(geocodedCoords);
      
      for (const address of addressesToGeocode) {
        try {
          const coords = await geocodeLocationAsync(address);
          newCoords.set(address, coords);
        } catch (error) {
          console.error(`Failed to geocode: ${address}`, error);
          newCoords.set(address, null);
        }
      }

      setGeocodedCoords(newCoords);
    };

    geocodeAddresses();
  }, [rawLoads, loadStops]);

  // Fetch real road routes (with waypoints) when geocoded coordinates change
  useEffect(() => {
    if (!rawLoads || geocodedCoords.size === 0) return;

    const pairs: { id: string; origin: { lat: number; lng: number }; destination: { lat: number; lng: number }; waypoints?: { lat: number; lng: number }[] }[] = [];
    const newRouteKeys = new Map<string, string>();

    rawLoads.forEach(load => {
      const oCoords = geocodedCoords.get(load.origin);
      const dCoords = geocodedCoords.get(load.destination);
      if (!oCoords || !dCoords) return;

      const stops = loadStops.get(load.id) || [];

      // If load has stops, wait until ALL are geocoded before fetching
      if (stops.length > 0) {
        const allStopsGeocoded = stops.every(s => geocodedCoords.has(s.address));
        if (!allStopsGeocoded) return; // wait for more geocoding
      }

      // Gather waypoint coordinates for intermediate stops
      const waypoints: { lat: number; lng: number }[] = [];
      stops.forEach(s => {
        const c = geocodedCoords.get(s.address);
        if (c) waypoints.push(c);
      });

      // Build a cache key that includes waypoint count
      const currentKey = `${load.id}:${waypoints.length}`;
      const existingKey = routeKeys.get(load.id);

      // Skip if we already fetched this exact route (same waypoint count)
      if (existingKey === currentKey) return;

      newRouteKeys.set(load.id, currentKey);

      pairs.push({
        id: load.id,
        origin: oCoords,
        destination: dCoords,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
      });
    });

    if (pairs.length === 0) return;

    fetchRoutesBatch(pairs).then(routes => {
      setRouteGeometries(prev => {
        const next = new Map(prev);
        routes.forEach((coords, id) => next.set(id, coords));
        return next;
      });
      setRouteKeys(prev => {
        const next = new Map(prev);
        newRouteKeys.forEach((key, id) => next.set(id, key));
        return next;
      });
    });
  }, [rawLoads, geocodedCoords, loadStops, routeKeys]);

  // Process loads with geocoded coordinates and GPS data
  const loads = useMemo(() => {
    if (!rawLoads) return [];

    return rawLoads.map(load => {
      const originCoords = geocodedCoords.get(load.origin) || null;
      const destCoords = geocodedCoords.get(load.destination) || null;
      
      const locationRecord = load.driver_id ? driverLocations.get(load.driver_id) : null;
      
      let truckCoords = null;
      let isLiveLocation = false;
      
      if (locationRecord) {
        truckCoords = { lat: Number(locationRecord.latitude), lng: Number(locationRecord.longitude) };
        isLiveLocation = isLocationLive(locationRecord);
      } else if (originCoords && destCoords) {
        const progress = getProgressFromStatus(load.status);
        truckCoords = interpolatePosition(originCoords, destCoords, progress);
      }

      // Resolve stop coordinates
      const stops = loadStops.get(load.id) || [];
      const stopCoords = stops
        .map(stop => {
          const c = geocodedCoords.get(stop.address);
          return c ? { lat: c.lat, lng: c.lng, stop } : null;
        })
        .filter((sc): sc is { lat: number; lng: number; stop: IntermediateStop } => sc !== null);

      return {
        ...load,
        originCoords,
        destCoords,
        truckCoords,
        isLiveLocation,
        stopCoords,
      } as LoadWithLocation;
    });
  }, [rawLoads, driverLocations, geocodedCoords, loadStops]);

  if (isLoading) {
    return (
      <Card className="card-elevated h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Navigation className="h-4 w-4 text-primary" />
            In Transit
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Skeleton className="aspect-square w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const renderMapContent = ({ isExpanded }: { isExpanded: boolean }) => (
    <div className={isExpanded ? 'w-full h-full' : 'aspect-square rounded-lg overflow-hidden border border-border relative'}>
      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        zoomControl={isExpanded}
        dragging={true}
        scrollWheelZoom={isExpanded}
        doubleClickZoom={isExpanded}
        touchZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <FitBounds loads={loads} />

        {loads.map(load => (
          <div key={load.id}>
            {/* Route line — real road or straight-line fallback */}
            {load.originCoords && load.destCoords && (
              <Polyline
                positions={
                  routeGeometries.get(load.id) || [
                    [load.originCoords.lat, load.originCoords.lng],
                    [load.destCoords.lat, load.destCoords.lng],
                  ]
                }
                pathOptions={{
                  color: '#22c55e',
                  weight: 3,
                  opacity: 0.6,
                  dashArray: routeGeometries.has(load.id) ? undefined : '10, 10',
                }}
              />
            )}

            {/* Origin marker */}
            {load.originCoords && (
              <Marker
                position={[load.originCoords.lat, load.originCoords.lng]}
                icon={originIcon}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-medium">Origin</p>
                    <p className="text-muted-foreground">{load.origin}</p>
                    <p className="text-xs mt-1">Load: {load.landstar_load_id || load.id.slice(0, 8)}</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Destination marker */}
            {load.destCoords && (
              <Marker
                position={[load.destCoords.lat, load.destCoords.lng]}
                icon={destinationIcon}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-medium">Destination</p>
                    <p className="text-muted-foreground">{load.destination}</p>
                    <p className="text-xs mt-1">Load: {load.landstar_load_id || load.id.slice(0, 8)}</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Intermediate stop markers */}
            {load.stopCoords.map((sc, idx) => (
              <Marker
                key={`stop-${load.id}-${idx}`}
                position={[sc.lat, sc.lng]}
                icon={waypointIcon}
              >
                <Popup>
                  <div className="text-sm min-w-[160px]">
                    <p className="font-medium">Stop {sc.stop.stopNumber} ({sc.stop.stopType})</p>
                    <p className="text-xs text-gray-600">{sc.stop.facilityName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{sc.stop.address}</p>
                    {sc.stop.date && <p className="text-xs text-gray-400">{sc.stop.date}</p>}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Truck marker */}
            {load.truckCoords && load.truck && (
              <Marker
                position={[load.truckCoords.lat, load.truckCoords.lng]}
                icon={load.isLiveLocation ? truckLiveIcon : truckIcon}
              >
                <Popup>
                  <div className="text-sm min-w-[140px]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium">Unit {load.truck.unit_number}</p>
                      {load.isLiveLocation ? (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                          <span className="relative flex h-1.5 w-1.5 mr-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                          </span>
                          Live GPS
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                          Estimated
                        </Badge>
                      )}
                    </div>
                    {load.driver && (
                      <p className="text-muted-foreground text-xs">
                        {load.driver.first_name} {load.driver.last_name}
                      </p>
                    )}
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                      <p>{load.origin}</p>
                      <p className="text-center">↓</p>
                      <p>{load.destination}</p>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </div>
        ))}
      </MapContainer>

      {!isExpanded && loads.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="text-center text-muted-foreground">
            <MapPin className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-sm">No loads in transit</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Navigation className="h-4 w-4 text-primary" />
              In Transit
            </CardTitle>
            <CardDescription className="text-xs">
              {loads.length} loads on the road
              {liveCount > 0 && (
                <span className="ml-1 text-green-500">
                  • {liveCount} live
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground hidden sm:inline">Origin</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground hidden sm:inline">Dest</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-muted-foreground hidden sm:inline">Stop</span>
            </div>
            <div className="flex items-center gap-1">
              <Radio className="h-3 w-3 text-green-500" />
              <span className="text-muted-foreground hidden sm:inline">Live</span>
            </div>
            <div className="flex items-center gap-1">
              <Truck className="h-3 w-3 text-blue-500" />
              <span className="text-muted-foreground hidden sm:inline">Est.</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <ExpandableMap renderMap={renderMapContent} title="Fleet Map — In Transit Loads" />
      </CardContent>
    </Card>
  );
}
