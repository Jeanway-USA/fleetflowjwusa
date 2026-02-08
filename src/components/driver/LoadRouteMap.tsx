import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeLocationAsync } from '@/lib/geocoding';
import { fetchRouteWithWaypoints } from '@/lib/routing';
import { parseIntermediateStops, type IntermediateStop } from '@/lib/parseIntermediateStops';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpandableMap } from '@/components/shared/ExpandableMap';

interface Coordinates {
  lat: number;
  lng: number;
}

interface LoadRouteMapProps {
  origin: string;
  destination: string;
  notes?: string | null;
}

interface GeocodedStop {
  coords: Coordinates;
  stop: IntermediateStop;
}

// Reuse icon patterns from FleetMapView
const originIcon = L.divIcon({
  html: `<div class="flex items-center justify-center" style="width:20px;height:20px;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#22c55e" width="20" height="20">
      <circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/>
    </svg>
  </div>`,
  className: 'custom-marker',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const destinationIcon = L.divIcon({
  html: `<div class="flex items-center justify-center" style="width:20px;height:20px;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ef4444" width="20" height="20">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/>
    </svg>
  </div>`,
  className: 'custom-marker',
  iconSize: [20, 20],
  iconAnchor: [10, 20],
});

const waypointIcon = L.divIcon({
  html: `<div class="flex items-center justify-center" style="width:18px;height:18px;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f59e0b" width="18" height="18">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/>
    </svg>
  </div>`,
  className: 'custom-marker',
  iconSize: [18, 18],
  iconAnchor: [9, 18],
  popupAnchor: [0, -14],
});

// Auto-fit bounds when coordinates are ready
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [points, map]);

  return null;
}

export function LoadRouteMap({ origin, destination, notes }: LoadRouteMapProps) {
  const [originCoords, setOriginCoords] = useState<Coordinates | null>(null);
  const [destCoords, setDestCoords] = useState<Coordinates | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [geocodedStops, setGeocodedStops] = useState<GeocodedStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const intermediateStops = useMemo(() => parseIntermediateStops(notes || null), [notes]);

  useEffect(() => {
    let cancelled = false;

    async function geocodeAndRoute() {
      setLoading(true);
      setFailed(false);

      try {
        // Geocode origin and destination
        const [oCoords, dCoords] = await Promise.all([
          geocodeLocationAsync(origin),
          geocodeLocationAsync(destination),
        ]);

        if (cancelled) return;

        if (!oCoords && !dCoords) {
          setFailed(true);
          return;
        }

        setOriginCoords(oCoords);
        setDestCoords(dCoords);

        // Geocode intermediate stops sequentially (rate-limited geocoder)
        const stopsGeocoded: GeocodedStop[] = [];
        for (const stop of intermediateStops) {
          if (cancelled) return;
          try {
            const coords = await geocodeLocationAsync(stop.address);
            if (coords) {
              stopsGeocoded.push({ coords, stop });
            }
          } catch {
            // Skip stops that fail to geocode
          }
        }
        if (!cancelled) setGeocodedStops(stopsGeocoded);

        // Fetch route with waypoints
        if (oCoords && dCoords) {
          const waypoints = stopsGeocoded.map(s => s.coords);
          const route = await fetchRouteWithWaypoints(oCoords, waypoints, dCoords);
          if (!cancelled) setRouteCoords(route);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    geocodeAndRoute();
    return () => { cancelled = true; };
  }, [origin, destination, intermediateStops]);

  if (loading) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }

  if (failed || (!originCoords && !destCoords)) {
    return null;
  }

  // Compute bounds from route, stop markers, or origin/dest
  const boundsPoints: [number, number][] = routeCoords && routeCoords.length > 1
    ? routeCoords
    : [
        ...(originCoords ? [[originCoords.lat, originCoords.lng] as [number, number]] : []),
        ...(destCoords ? [[destCoords.lat, destCoords.lng] as [number, number]] : []),
        ...geocodedStops.map(s => [s.coords.lat, s.coords.lng] as [number, number]),
      ];

  const center: [number, number] = originCoords
    ? [originCoords.lat, originCoords.lng]
    : [destCoords!.lat, destCoords!.lng];

  const renderMap = ({ isExpanded }: { isExpanded: boolean }) => (
    <div className={isExpanded ? 'w-full h-full' : 'h-40 w-full rounded-lg overflow-hidden border border-border'}>
      <MapContainer
        center={center}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        zoomControl={isExpanded}
        dragging={isExpanded}
        scrollWheelZoom={isExpanded}
        doubleClickZoom={isExpanded}
        touchZoom={isExpanded}
        attributionControl={false}
        className="z-0"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        {boundsPoints.length >= 2 && <FitBounds points={boundsPoints} />}

        {/* Route polyline — real road with waypoints */}
        {routeCoords && routeCoords.length > 0 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: 'hsl(var(--primary))',
              weight: 3,
              opacity: 0.8,
            }}
          />
        )}

        {originCoords && (
          <Marker position={[originCoords.lat, originCoords.lng]} icon={originIcon} />
        )}

        {destCoords && (
          <Marker position={[destCoords.lat, destCoords.lng]} icon={destinationIcon} />
        )}

        {/* Intermediate stop markers */}
        {geocodedStops.map((gs, idx) => (
          <Marker
            key={`stop-${idx}`}
            position={[gs.coords.lat, gs.coords.lng]}
            icon={waypointIcon}
          >
            <Popup>
              <div className="text-sm min-w-[160px]">
                <p className="font-medium">Stop {gs.stop.stopNumber} ({gs.stop.stopType})</p>
                <p className="text-xs text-gray-600">{gs.stop.facilityName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{gs.stop.address}</p>
                {gs.stop.date && <p className="text-xs text-gray-400">{gs.stop.date}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );

  return (
    <ExpandableMap renderMap={renderMap} title={`Route: ${origin} → ${destination}`} />
  );
}
