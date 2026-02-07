import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeLocationAsync } from '@/lib/geocoding';
import { fetchRoute } from '@/lib/routing';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpandableMap } from '@/components/shared/ExpandableMap';

interface Coordinates {
  lat: number;
  lng: number;
}

interface LoadRouteMapProps {
  origin: string;
  destination: string;
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

export function LoadRouteMap({ origin, destination }: LoadRouteMapProps) {
  const [originCoords, setOriginCoords] = useState<Coordinates | null>(null);
  const [destCoords, setDestCoords] = useState<Coordinates | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function geocodeAndRoute() {
      setLoading(true);
      setFailed(false);

      try {
        const [oCoords, dCoords] = await Promise.all([
          geocodeLocationAsync(origin),
          geocodeLocationAsync(destination),
        ]);

        if (cancelled) return;

        if (!oCoords && !dCoords) {
          setFailed(true);
        } else {
          setOriginCoords(oCoords);
          setDestCoords(dCoords);

          // Fetch real road route if both coordinates exist
          if (oCoords && dCoords) {
            const route = await fetchRoute(oCoords, dCoords);
            if (!cancelled) setRouteCoords(route);
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    geocodeAndRoute();
    return () => { cancelled = true; };
  }, [origin, destination]);

  if (loading) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }

  if (failed || (!originCoords && !destCoords)) {
    return null; // Silently hide if geocoding fails
  }

  // Compute bounds from route or markers
  const boundsPoints: [number, number][] = routeCoords && routeCoords.length > 1
    ? routeCoords
    : [
        ...(originCoords ? [[originCoords.lat, originCoords.lng] as [number, number]] : []),
        ...(destCoords ? [[destCoords.lat, destCoords.lng] as [number, number]] : []),
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

        {/* Route polyline — real road or straight-line fallback */}
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
      </MapContainer>
    </div>
  );

  return (
    <ExpandableMap renderMap={renderMap} title={`Route: ${origin} → ${destination}`} />
  );
}
