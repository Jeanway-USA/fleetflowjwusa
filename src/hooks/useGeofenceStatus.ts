import { useState, useEffect, useRef } from 'react';
import { geocodeLocationAsync } from '@/lib/geocoding';

interface Coordinates {
  lat: number;
  lng: number;
}

interface UseGeofenceStatusResult {
  isNearDestination: boolean;
  distanceMiles: number | null;
  dismiss: () => void;
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
  destinationAddress: string | null,
  loadId: string | null
): UseGeofenceStatusResult {
  const [destCoords, setDestCoords] = useState<Coordinates | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const lastLoadIdRef = useRef<string | null>(null);

  // Reset dismissed state when load changes
  useEffect(() => {
    if (loadId !== lastLoadIdRef.current) {
      lastLoadIdRef.current = loadId;
      setDismissed(false);
      setDestCoords(null);
    }
  }, [loadId]);

  // Geocode destination address
  useEffect(() => {
    if (!destinationAddress) {
      setDestCoords(null);
      return;
    }
    let cancelled = false;
    geocodeLocationAsync(destinationAddress).then((coords) => {
      if (!cancelled && coords) {
        setDestCoords(coords);
      }
    });
    return () => { cancelled = true; };
  }, [destinationAddress]);

  const distanceMiles = driverCoords && destCoords
    ? haversineDistance(driverCoords, destCoords)
    : null;

  const isNearDestination = !dismissed && distanceMiles !== null && distanceMiles < GEOFENCE_RADIUS_MILES;

  return {
    isNearDestination,
    distanceMiles,
    dismiss: () => setDismissed(true),
  };
}
