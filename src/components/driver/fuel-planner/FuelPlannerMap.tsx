import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { IntermediateStop } from '@/lib/parseIntermediateStops';

interface FuelStop {
  name: string;
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
  distance_from_route?: number;
}

interface GeocodedStop {
  coords: { lat: number; lng: number };
  stop: IntermediateStop;
}

interface FuelPlannerMapProps {
  isExpanded: boolean;
  originCoords: { lat: number; lng: number };
  destCoords: { lat: number; lng: number };
  routePositions: [number, number][];
  mapPoints: [number, number][];
  fuelStops: FuelStop[];
  geocodedStops: GeocodedStop[];
}

// ===== Map Marker Icons =====

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

export function FuelPlannerMap({
  isExpanded,
  originCoords,
  destCoords,
  routePositions,
  mapPoints,
  fuelStops,
  geocodedStops,
}: FuelPlannerMapProps) {
  return (
    <div className={isExpanded ? 'w-full h-full' : 'h-48 w-full rounded-lg overflow-hidden border border-border'}>
      <MapContainer
        center={[originCoords.lat, originCoords.lng]}
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
        <FitBounds points={mapPoints} />

        <Polyline
          positions={routePositions}
          pathOptions={{
            color: 'hsl(var(--primary))',
            weight: 3,
            opacity: 0.8,
          }}
        />

        <Marker position={[originCoords.lat, originCoords.lng]} icon={originIcon} />
        <Marker position={[destCoords.lat, destCoords.lng]} icon={destinationIcon} />

        {geocodedStops.map((gs, idx) => (
          <Marker
            key={`waypoint-${idx}`}
            position={[gs.coords.lat, gs.coords.lng]}
            icon={waypointIcon}
          >
            <Popup>
              <div className="text-sm min-w-[160px]">
                <p className="font-semibold">Stop {gs.stop.stopNumber} ({gs.stop.stopType})</p>
                <p className="text-xs text-gray-600">{gs.stop.facilityName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{gs.stop.address}</p>
                {gs.stop.date && <p className="text-xs text-gray-400">{gs.stop.date}</p>}
              </div>
            </Popup>
          </Marker>
        ))}

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
                  {stop.ifta_tax_credit && stop.ifta_tax_credit > 0 && (
                    <p className="text-emerald-700 text-xs">
                      IFTA Credit: -${stop.ifta_tax_credit.toFixed(2)}/gal
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
  );
}
