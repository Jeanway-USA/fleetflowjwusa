import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Truck, Package, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeLocation, interpolatePosition, getProgressFromStatus } from '@/lib/geocoding';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const createIcon = (color: string, iconType: 'truck' | 'origin' | 'destination') => {
  const svgIcon = iconType === 'truck' 
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="24" height="24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
    : iconType === 'origin'
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="20" height="20"><circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="20" height="20"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/></svg>`;

  return L.divIcon({
    html: `<div style="display: flex; align-items: center; justify-content: center; width: ${iconType === 'truck' ? 32 : 24}px; height: ${iconType === 'truck' ? 32 : 24}px;">${svgIcon}</div>`,
    className: 'custom-marker',
    iconSize: [iconType === 'truck' ? 32 : 24, iconType === 'truck' ? 32 : 24],
    iconAnchor: [iconType === 'truck' ? 16 : 12, iconType === 'truck' ? 16 : 12],
    popupAnchor: [0, -16],
  });
};

const truckIcon = createIcon('#3b82f6', 'truck');
const originIcon = createIcon('#22c55e', 'origin');
const destinationIcon = createIcon('#ef4444', 'destination');

interface LoadWithLocation {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  driver: { first_name: string; last_name: string } | null;
  truck: { unit_number: string } | null;
  originCoords: { lat: number; lng: number } | null;
  destCoords: { lat: number; lng: number } | null;
  truckCoords: { lat: number; lng: number } | null;
}

// Component to fit map bounds
function FitBounds({ loads }: { loads: LoadWithLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (loads.length === 0) return;

    const allCoords: [number, number][] = [];
    loads.forEach(load => {
      if (load.originCoords) allCoords.push([load.originCoords.lat, load.originCoords.lng]);
      if (load.destCoords) allCoords.push([load.destCoords.lat, load.destCoords.lng]);
      if (load.truckCoords) allCoords.push([load.truckCoords.lat, load.truckCoords.lng]);
    });

    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [loads, map]);

  return null;
}

const statusColors: Record<string, string> = {
  assigned: '#3b82f6',
  loading: '#f59e0b',
  in_transit: '#22c55e',
  unloading: '#a855f7',
};

export function FleetMapView() {
  const { data: rawLoads, isLoading } = useQuery({
    queryKey: ['active-loads-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select(`
          id,
          landstar_load_id,
          origin,
          destination,
          status,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name),
          truck:trucks!fleet_loads_truck_id_fkey(unit_number)
        `)
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading']);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Process loads with geocoded coordinates
  const loads = useMemo(() => {
    if (!rawLoads) return [];

    return rawLoads.map(load => {
      const originCoords = geocodeLocation(load.origin);
      const destCoords = geocodeLocation(load.destination);
      
      let truckCoords = null;
      if (originCoords && destCoords) {
        const progress = getProgressFromStatus(load.status);
        truckCoords = interpolatePosition(originCoords, destCoords, progress);
      }

      return {
        ...load,
        originCoords,
        destCoords,
        truckCoords,
      } as LoadWithLocation;
    });
  }, [rawLoads]);

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Fleet Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" />
              Fleet Map
            </CardTitle>
            <CardDescription>
              {loads.length} active loads • Live positions simulated
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Origin</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Destination</span>
            </div>
            <div className="flex items-center gap-1">
              <Truck className="h-3 w-3 text-blue-500" />
              <span className="text-muted-foreground">Truck</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] rounded-lg overflow-hidden border border-border">
          <MapContainer
            center={[39.8283, -98.5795]}
            zoom={4}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <FitBounds loads={loads} />

            {loads.map(load => {
              const routeColor = statusColors[load.status] || '#6b7280';
              
              return (
                <div key={load.id}>
                  {/* Route line */}
                  {load.originCoords && load.destCoords && (
                    <Polyline
                      positions={[
                        [load.originCoords.lat, load.originCoords.lng],
                        [load.destCoords.lat, load.destCoords.lng],
                      ]}
                      pathOptions={{
                        color: routeColor,
                        weight: 3,
                        opacity: 0.6,
                        dashArray: '10, 10',
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

                  {/* Truck marker */}
                  {load.truckCoords && load.truck && (
                    <Marker
                      position={[load.truckCoords.lat, load.truckCoords.lng]}
                      icon={truckIcon}
                    >
                      <Popup>
                        <div className="text-sm min-w-[150px]">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium">Unit {load.truck.unit_number}</p>
                            <Badge variant="outline" className="text-xs">
                              {load.status.replace('_', ' ')}
                            </Badge>
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
              );
            })}
          </MapContainer>
        </div>

        {loads.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active loads to display</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
