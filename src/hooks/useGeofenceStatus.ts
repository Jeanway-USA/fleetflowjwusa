import { useState, useEffect, useRef } from 'react';
import { geocodeLocationAsync } from '@/lib/geocoding';

interface Coordinates {
  lat: number;
  lng: number;
}

interface UseGeofenceStatusResult {
  atOrigin: boolean;
  atDestination: boolean;
  distanceMiles: number | null;
  originCoords: Coordinates | null;
  destinationCoords: Coordinates | null;
}

const GEOFENCE_RADIUS_MILES = 2;

function haversineDistance(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useGeofenceStatus(
  driverCoords: Coordinates | null,
  originAddress: string | null,
  destinationAddress: string | null,
  loadId: string | null,
  status: string | null,
): UseGeofenceStatusResult {
  const [originCoords, setOriginCoords] = useState<Coordinates | null>(null);
  const [destCoords, setDestCoords] = useState<Coordinates | null>(null);
  const lastLoadIdRef = useRef<string | null>(null);

  // Reset cached coords when load changes
  useEffect(() => {
    if (loadId !== lastLoadIdRef.current) {
      lastLoadIdRef.current = loadId;
      setOriginCoords(null);
      setDestCoords(null);
    }
  }, [loadId]);

  // Geocode origin
  useEffect(() => {
    if (!originAddress) { setOriginCoords(null); return; }
    let cancelled = false;
    geocodeLocationAsync(originAddress).then((coords) => {
      if (!cancelled && coords) setOriginCoords(coords);
    });
    return () => { cancelled = true; };
  }, [originAddress]);

  // Geocode destination
  useEffect(() => {
    if (!destinationAddress) { setDestCoords(null); return; }
    let cancelled = false;
    geocodeLocationAsync(destinationAddress).then((coords) => {
      if (!cancelled && coords) setDestCoords(coords);
    });
    return () => { cancelled = true; };
  }, [destinationAddress]);

  // Choose the active endpoint based on current status
  const watchingOrigin = status === 'assigned' || status === 'pending' || status === 'loading';
  const watchingDest = status === 'in_transit';

  const originDist = driverCoords && originCoords
    ? haversineDistance(driverCoords, originCoords) : null;
  const destDist = driverCoords && destCoords
    ? haversineDistance(driverCoords, destCoords) : null;

  const distanceMiles = watchingDest ? destDist : watchingOrigin ? originDist : null;

  const atOrigin = !!(watchingOrigin && originDist !== null && originDist < GEOFENCE_RADIUS_MILES);
  const atDestination = !!(watchingDest && destDist !== null && destDist < GEOFENCE_RADIUS_MILES);

  return { atOrigin, atDestination, distanceMiles, originCoords, destinationCoords: destCoords };
}
