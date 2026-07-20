import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  MapPin,
  Navigation,
  Radio,
  Cloud,
  TrafficCone,
  Layers,
  ChevronDown,
  Truck as TruckIcon,
  CloudSun,
} from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from '@/contexts/ThemeContext';
import { geocodeLocationAsync, interpolatePosition, getProgressFromStatus } from '@/lib/geocoding';
import { parseIntermediateStops, type IntermediateStop } from '@/lib/parseIntermediateStops';
import { ExpandableMap } from '@/components/shared/ExpandableMap';
import { WeatherForecastPanel } from './WeatherForecastPanel';
import { snapPointToRoute } from '@/lib/geo/snapToRoute';

const OVERLAY_STORAGE_KEY = 'fleet-map-overlays-v2';
const RAINVIEWER_INDEX_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const MAPBOX_TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN as
  | string
  | undefined;

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
  liveRouteGeometry: [number, number][] | null;
  routeCongestion: string[] | null;
}

function isLocationLive(loc: DriverLocation): boolean {
  if (!loc.is_sharing) return false;
  const updatedAt = new Date(loc.updated_at);
  const minutesAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60);
  return minutesAgo < 10;
}

function loadFeatureId(loadId: string) {
  // Numeric feature id (Mapbox setFeatureState needs number|string). String is fine.
  return loadId;
}

interface OverlayState {
  traffic: boolean;
  weather: boolean;
  trucks: boolean;
  trafficOpacity: number; // 0-100
  radarOpacity: number; // 0-100
}
const DEFAULT_OVERLAYS: OverlayState = {
  traffic: false,
  weather: false,
  trucks: true,
  trafficOpacity: 80,
  radarOpacity: 55,
};

function readOverlays(): OverlayState {
  if (typeof window === 'undefined') return DEFAULT_OVERLAYS;
  try {
    const raw = window.localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return DEFAULT_OVERLAYS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_OVERLAYS, ...parsed };
  } catch {
    return DEFAULT_OVERLAYS;
  }
}

export function FleetMapView() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [overlays, setOverlays] = useState<OverlayState>(readOverlays);
  useEffect(() => {
    try {
      window.localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(overlays));
    } catch {
      /* no-op */
    }
  }, [overlays]);

  // ---- Data: driver locations ----
  const [driverLocations, setDriverLocations] = useState<Map<string, DriverLocation>>(new Map());
  const [liveCount, setLiveCount] = useState(0);
  const [geocodedCoords, setGeocodedCoords] = useState<
    Map<string, { lat: number; lng: number } | null>
  >(new Map());
  const [liveRouteGeometries, setLiveRouteGeometries] = useState<
    Map<string, [number, number][]>
  >(new Map());
  const [routeCongestions, setRouteCongestions] = useState<Map<string, string[]>>(new Map());
  const routeFetchAttemptsRef = useRef<Map<string, number>>(new Map());

  const { data: initialLocations } = useQuery({
    queryKey: ['driver-locations'],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('driver_id, latitude, longitude, speed, heading, updated_at, is_sharing');
      if (error) throw error;
      return data as DriverLocation[];
    },
  });

  useEffect(() => {
    if (!initialLocations) return;
    const locMap = new Map<string, DriverLocation>();
    let live = 0;
    initialLocations.forEach((loc) => {
      locMap.set(loc.driver_id, loc);
      if (isLocationLive(loc)) live++;
    });
    setDriverLocations(locMap);
    setLiveCount(live);
  }, [initialLocations]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('driver-locations-realtime-mbx')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'driver_locations' },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              setDriverLocations((prev) => {
                const next = new Map(prev);
                next.delete((payload.old as any).driver_id);
                let live = 0;
                next.forEach((l) => {
                  if (isLocationLive(l)) live++;
                });
                setLiveCount(live);
                return next;
              });
            } else {
              const newLoc = payload.new as DriverLocation;
              setDriverLocations((prev) => {
                const next = new Map(prev);
                next.set(newLoc.driver_id, newLoc);
                let live = 0;
                next.forEach((l) => {
                  if (isLocationLive(l)) live++;
                });
                setLiveCount(live);
                return next;
              });
            }
          },
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime unavailable:', err);
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // ---- Data: in-transit loads ----
  const { data: rawLoads, isLoading } = useQuery({
    queryKey: ['in-transit-loads-map-mbx'],
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
          current_route_geometry,
          current_route_updated_at,
          current_route_congestion,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name),
          truck:trucks!fleet_loads_truck_id_fkey(unit_number)
        `)
        .eq('status', 'in_transit')
        .is('deleted_at', null);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!rawLoads) return;
    setLiveRouteGeometries((prev) => {
      const next = new Map(prev);
      rawLoads.forEach((load: any) => {
        const raw = load.current_route_geometry;
        if (Array.isArray(raw) && raw.length >= 2) {
          const coerced: [number, number][] = raw
            .filter((p: any) => Array.isArray(p) && p.length >= 2)
            .map((p: any) => [Number(p[0]), Number(p[1])] as [number, number])
            .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
          if (coerced.length >= 2) next.set(load.id, coerced);
        }
      });
      return next;
    });
    setRouteCongestions((prev) => {
      const next = new Map(prev);
      rawLoads.forEach((load: any) => {
        const raw = load.current_route_congestion;
        if (Array.isArray(raw) && raw.length > 0) {
          next.set(load.id, raw.map((c: any) => (typeof c === 'string' ? c : 'unknown')));
        }
      });
      return next;
    });
  }, [rawLoads]);


  useEffect(() => {
    const ids = (rawLoads ?? []).map((l: any) => l.id).filter(Boolean);
    if (ids.length === 0) return;
    const channel = supabase
      .channel('fleet-loads-route-realtime-mbx')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fleet_loads' },
        (payload) => {
          const row: any = payload.new;
          if (!row?.id || !ids.includes(row.id)) return;
          const raw = row.current_route_geometry;
          if (!Array.isArray(raw) || raw.length < 2) return;
          const coerced: [number, number][] = raw
            .filter((p: any) => Array.isArray(p) && p.length >= 2)
            .map((p: any) => [Number(p[0]), Number(p[1])] as [number, number])
            .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
          if (coerced.length < 2) return;
          setLiveRouteGeometries((prev) => {
            const next = new Map(prev);
            next.set(row.id, coerced);
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rawLoads]);

  const loadStops = useMemo(() => {
    const map = new Map<string, IntermediateStop[]>();
    if (!rawLoads) return map;
    rawLoads.forEach((load) => {
      const stops = parseIntermediateStops(load.notes);
      if (stops.length > 0) map.set(load.id, stops);
    });
    return map;
  }, [rawLoads]);

  // ---- Geocoding of origin/destination (and stops) ----
  useEffect(() => {
    if (!rawLoads) return;
    const geocode = async () => {
      const addressesToGeocode: string[] = [];
      rawLoads.forEach((load) => {
        if (!geocodedCoords.has(load.origin)) addressesToGeocode.push(load.origin);
        if (!geocodedCoords.has(load.destination)) addressesToGeocode.push(load.destination);
      });
      loadStops.forEach((stops) => {
        stops.forEach((stop) => {
          if (!geocodedCoords.has(stop.address)) addressesToGeocode.push(stop.address);
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
    geocode();
  }, [rawLoads, loadStops]); // eslint-disable-line react-hooks/exhaustive-deps

  const loads: LoadWithLocation[] = useMemo(() => {
    if (!rawLoads) return [];
    return rawLoads.map((load) => {
      const originCoords = geocodedCoords.get(load.origin) || null;
      const destCoords = geocodedCoords.get(load.destination) || null;
      const locationRecord = load.driver_id ? driverLocations.get(load.driver_id) : null;
      let truckCoords: { lat: number; lng: number } | null = null;
      let isLiveLocation = false;
      if (locationRecord) {
        truckCoords = {
          lat: Number(locationRecord.latitude),
          lng: Number(locationRecord.longitude),
        };
        isLiveLocation = isLocationLive(locationRecord);
      } else if (originCoords && destCoords) {
        const progress = getProgressFromStatus(load.status);
        truckCoords = interpolatePosition(originCoords, destCoords, progress);
      }
      const stops = loadStops.get(load.id) || [];
      const stopCoords = stops
        .map((stop) => {
          const c = geocodedCoords.get(stop.address);
          return c ? { lat: c.lat, lng: c.lng, stop } : null;
        })
        .filter(
          (sc): sc is { lat: number; lng: number; stop: IntermediateStop } => sc !== null,
        );
      return {
        ...load,
        originCoords,
        destCoords,
        truckCoords,
        isLiveLocation,
        stopCoords,
        liveRouteGeometry: liveRouteGeometries.get(load.id) ?? null,
        routeCongestion: routeCongestions.get(load.id) ?? null,
      } as LoadWithLocation;
    });
  }, [rawLoads, driverLocations, geocodedCoords, loadStops, liveRouteGeometries, routeCongestions]);

  // ---- Auto-fetch truck-friendly routes for loads that don't have one yet ----
  useEffect(() => {
    if (!rawLoads) return;
    const attempts = routeFetchAttemptsRef.current;
    const stale = 30 * 60 * 1000;
    (async () => {
      for (const load of rawLoads as any[]) {
        const origin = geocodedCoords.get(load.origin);
        const destination = geocodedCoords.get(load.destination);
        if (!origin || !destination) continue;
        // Skip if we already have geometry
        if (liveRouteGeometries.has(load.id)) continue;
        // Skip if the DB row is fresh (already fetched previously)
        if (load.current_route_updated_at) {
          const age = Date.now() - new Date(load.current_route_updated_at).getTime();
          if (age < stale) continue;
        }
        const key = `${load.id}:${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}->${destination.lat.toFixed(3)},${destination.lng.toFixed(3)}`;
        const prev = attempts.get(key) ?? 0;
        if (prev >= 2) continue;
        attempts.set(key, prev + 1);
        const stops = loadStops.get(load.id) ?? [];
        const waypoints = stops
          .map((s) => {
            const c = geocodedCoords.get(s.address);
            return c ? { lat: c.lat, lng: c.lng } : null;
          })
          .filter((c): c is { lat: number; lng: number } => !!c);
        try {
          const { data, error } = await supabase.functions.invoke('route-load', {
            body: { origin, destination, waypoints },
          });
          if (error || !data?.geometry || !Array.isArray(data.geometry)) continue;
          const geom = data.geometry as [number, number][];
          const cong = (data.congestion as string[]) ?? [];
          setLiveRouteGeometries((prev) => {
            const next = new Map(prev);
            next.set(load.id, geom);
            return next;
          });
          setRouteCongestions((prev) => {
            const next = new Map(prev);
            next.set(load.id, cong);
            return next;
          });
          // Background persist — non-blocking, ignore failure
          supabase
            .from('fleet_loads')
            .update({
              current_route_geometry: geom as any,
              current_route_congestion: cong as any,
              current_route_distance_m: data.distance_m ?? null,
              current_route_duration_s: data.duration_s ?? null,
              current_route_updated_at: new Date().toISOString(),
            })
            .eq('id', load.id)
            .then(() => {});
        } catch (err) {
          console.warn('route-load failed for', load.id, err);
        }
      }
    })();
  }, [rawLoads, geocodedCoords, loadStops, liveRouteGeometries]);


  // ---- RainViewer radar tile URL template ----
  const [radarUrlTemplate, setRadarUrlTemplate] = useState<string | null>(null);
  useEffect(() => {
    if (!overlays.weather) {
      setRadarUrlTemplate(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(RAINVIEWER_INDEX_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`RainViewer ${res.status}`);
        const data = await res.json();
        const host = data.host;
        const latestFrame = data.radar?.past?.[data.radar.past.length - 1];
        if (!host || !latestFrame?.path) throw new Error('Malformed RainViewer response');
        if (!cancelled) setRadarUrlTemplate(`${host}${latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`);
      } catch (err) {
        if (!cancelled) {
          setRadarUrlTemplate(null);
          toast.error('Weather radar is temporarily unavailable');
        }
      }
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [overlays.weather]);

  // ---- Selected load for auto-center + forecast panel ----
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const selectedLoad = useMemo(
    () => loads.find((l) => l.id === selectedLoadId) ?? null,
    [loads, selectedLoadId],
  );

  const renderMapContent = useCallback(
    ({ isExpanded }: { isExpanded: boolean }) => (
      <MapboxCanvas
        isExpanded={isExpanded}
        isDark={isDark}
        loads={loads}
        overlays={overlays}
        setOverlays={setOverlays}
        radarUrlTemplate={radarUrlTemplate}
        selectedLoadId={selectedLoadId}
        onSelectLoad={setSelectedLoadId}
      />
    ),
    [isDark, loads, overlays, radarUrlTemplate, selectedLoadId],
  );

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

  if (!MAPBOX_TOKEN) {
    return (
      <Card className="card-elevated h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Navigation className="h-4 w-4 text-primary" />
            In Transit
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="aspect-square w-full rounded-lg border border-dashed border-border flex items-center justify-center text-center p-6">
            <div>
              <MapPin className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Mapbox not configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Link the Mapbox connector to enable the fleet map.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Navigation className="h-4 w-4 text-primary" />
              In Transit
            </CardTitle>
            <CardDescription className="text-xs">
              {loads.length} loads on the road
              {liveCount > 0 && (
                <span className="ml-1 text-green-500">• {liveCount} live</span>
              )}
            </CardDescription>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Origin</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Dest</span>
            </div>
            <div className="flex items-center gap-1">
              <Radio className="h-3 w-3 text-green-500" />
              <span className="text-muted-foreground">Live</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className={selectedLoad ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-3' : ''}>
          <ExpandableMap renderMap={renderMapContent} title="Fleet Map — In Transit Loads" />
          {selectedLoad && (
            <div className="hidden xl:block h-full min-h-[360px]">
              <WeatherForecastPanel
                loadLabel={selectedLoad.landstar_load_id || selectedLoad.id.slice(0, 8)}
                origin={selectedLoad.origin}
                destination={selectedLoad.destination}
                pickupCoords={selectedLoad.originCoords}
                destCoords={selectedLoad.destCoords}
                truckCoords={selectedLoad.truckCoords}
                onClose={() => setSelectedLoadId(null)}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Mapbox canvas — mounts the actual GL map inside ExpandableMap
// ============================================================================

interface MapboxCanvasProps {
  isExpanded: boolean;
  isDark: boolean;
  loads: LoadWithLocation[];
  overlays: OverlayState;
  setOverlays: React.Dispatch<React.SetStateAction<OverlayState>>;
  radarUrlTemplate: string | null;
  selectedLoadId: string | null;
  onSelectLoad: (id: string | null) => void;
}

const LOAD_STATUS_COLOR = '#22c55e';
const LIVE_ROUTE_COLOR = '#16a34a';
const MAPBOX_STYLE_READY_TIMEOUT_MS = 6_000;

function getMapboxStyleKey(isDark: boolean) {
  return isDark ? 'navigation-night-v1' : 'navigation-day-v1';
}

function getMapboxFallbackStyleKey(isDark: boolean) {
  return isDark ? 'dark-v11' : 'light-v11';
}

function buildMapboxRasterStyle(styleKey: string): mapboxgl.StyleSpecification {
  const token = MAPBOX_TOKEN ?? '';
  return {
    version: 8,
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    sources: {
      'mapbox-base': {
        type: 'raster',
        tiles: [
          `https://api.mapbox.com/styles/v1/mapbox/${styleKey}/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`,
        ],
        tileSize: 512,
        attribution: '© Mapbox © OpenStreetMap',
      },
    },
    layers: [
      {
        id: 'mapbox-base',
        type: 'raster',
        source: 'mapbox-base',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

function MapboxCanvas({
  isExpanded,
  isDark,
  loads,
  overlays,
  setOverlays,
  radarUrlTemplate,
  selectedLoadId,
  onSelectLoad,
}: MapboxCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const truckPopupRef = useRef<mapboxgl.Popup | null>(null);
  const styleUrlRef = useRef<string | null>(null);
  const fallbackStyleUsedRef = useRef(false);
  const styleReadyTimerRef = useRef<number | null>(null);

  const clearStyleReadyTimer = useCallback(() => {
    if (styleReadyTimerRef.current) {
      window.clearTimeout(styleReadyTimerRef.current);
      styleReadyTimerRef.current = null;
    }
  }, []);

  const markStyleReady = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.loaded() && !map.isStyleLoaded()) return;
    clearStyleReadyTimer();
    setMapError(null);
    setStyleReady(true);
    requestAnimationFrame(() => map.resize());
  }, [clearStyleReadyTimer]);

  const armStyleReadyFallback = useCallback(
    (map: mapboxgl.Map, nextStyleUrl: string, isFallback = false) => {
      clearStyleReadyTimer();
      styleReadyTimerRef.current = window.setTimeout(() => {
        if (!mapRef.current || mapRef.current !== map) return;
        if (map.isStyleLoaded() || map.loaded()) {
          markStyleReady();
          return;
        }
        if (!isFallback && !fallbackStyleUsedRef.current) {
          const fallbackStyle = getMapboxFallbackStyleKey(isDark);
          fallbackStyleUsedRef.current = true;
          styleUrlRef.current = fallbackStyle;
          setStyleReady(false);
          map.setStyle(buildMapboxRasterStyle(fallbackStyle));
          armStyleReadyFallback(map, fallbackStyle, true);
          return;
        }
        setMapError('The map style is taking too long to load.');
      }, MAPBOX_STYLE_READY_TIMEOUT_MS);

      styleUrlRef.current = nextStyleUrl;
    },
    [clearStyleReadyTimer, isDark, markStyleReady],
  );

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      mapboxgl.accessToken = MAPBOX_TOKEN as string;
      const initialStyle = getMapboxStyleKey(isDark);
      styleUrlRef.current = initialStyle;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: buildMapboxRasterStyle(initialStyle),
        center: [-98.5795, 39.8283],
        zoom: 3.4,
        projection: { name: 'mercator' },
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('load', markStyleReady);
      map.on('style.load', markStyleReady);
      map.on('idle', markStyleReady);
      map.on('error', (e) => {
        const msg = e?.error?.message || '';
        // Silence expected RainViewer tile 404s at world zoom levels.
        if (msg.includes('tilecache.rainviewer.com')) return;
        if (msg.includes('applyProjectionUpdate')) return;
        if (msg.includes('Failed to load style') && !fallbackStyleUsedRef.current) {
          const fallbackStyle = getMapboxFallbackStyleKey(isDark);
          fallbackStyleUsedRef.current = true;
          styleUrlRef.current = fallbackStyle;
          setStyleReady(false);
          map.setStyle(buildMapboxRasterStyle(fallbackStyle));
          armStyleReadyFallback(map, fallbackStyle, true);
          return;
        }
        console.warn('Mapbox error', msg || e);
      });
      mapRef.current = map;
      armStyleReadyFallback(map, initialStyle);
      requestAnimationFrame(() => {
        map.resize();
        window.setTimeout(() => map.resize(), 250);
      });
    } catch (err: any) {
      console.error(err);
      setMapError(err?.message || 'Failed to initialize map');
    }
    return () => {
      truckPopupRef.current?.remove();
      truckPopupRef.current = null;
      clearStyleReadyTimer();
      mapRef.current?.remove();
      mapRef.current = null;
      setStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep Mapbox sized to the rendered card/dialog dimensions.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;

    const resizeMap = () => requestAnimationFrame(() => map.resize());
    resizeMap();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resizeMap);
      return () => window.removeEventListener('resize', resizeMap);
    }

    const observer = new ResizeObserver(resizeMap);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isExpanded, styleReady]);

  // Swap style on theme change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextStyle = getMapboxStyleKey(isDark);
    if (styleUrlRef.current === nextStyle) return;
    fallbackStyleUsedRef.current = false;
    setStyleReady(false);
    setMapError(null);
    styleUrlRef.current = nextStyle;
    map.setStyle(buildMapboxRasterStyle(nextStyle));
    armStyleReadyFallback(map, nextStyle);
  }, [armStyleReadyFallback, isDark]);

  // ---- Traffic layer (Mapbox mapbox-traffic-v1) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const SRC = 'mbx-traffic';
    const LYR = 'mbx-traffic-lyr';
    try {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-traffic-v1',
        });
      }
      if (!map.getLayer(LYR)) {
        map.addLayer({
          id: LYR,
          type: 'line',
          source: SRC,
          'source-layer': 'traffic',
          minzoom: 3,
          filter: ['all', ['==', ['geometry-type'], 'LineString']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
            visibility: overlays.traffic ? 'visible' : 'none',
          },
          paint: {
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              1.2,
              10,
              2.4,
              14,
              4,
            ],
            'line-color': [
              'match',
              ['get', 'congestion'],
              'low',
              '#22c55e',
              'moderate',
              '#eab308',
              'heavy',
              '#f97316',
              'severe',
              '#dc2626',
              '#94a3b8',
            ],
            'line-opacity': overlays.trafficOpacity / 100,
          },
        });
      } else {
        map.setLayoutProperty(LYR, 'visibility', overlays.traffic ? 'visible' : 'none');
        map.setPaintProperty(LYR, 'line-opacity', overlays.trafficOpacity / 100);
      }
    } catch (err) {
      console.warn('Traffic layer error:', err);
    }
  }, [styleReady, overlays.traffic, overlays.trafficOpacity]);

  // ---- Radar raster layer ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const SRC = 'rainviewer-src';
    const LYR = 'rainviewer-lyr';
    try {
      // Remove first to allow url template refresh
      if (map.getLayer(LYR)) map.removeLayer(LYR);
      if (map.getSource(SRC)) map.removeSource(SRC);
      if (overlays.weather && radarUrlTemplate) {
        map.addSource(SRC, {
          type: 'raster',
          tiles: [radarUrlTemplate],
          tileSize: 256,
        });
        map.addLayer({
          id: LYR,
          type: 'raster',
          source: SRC,
          paint: { 'raster-opacity': overlays.radarOpacity / 100 },
        });
      }
    } catch (err) {
      console.warn('Radar layer error:', err);
    }
  }, [styleReady, overlays.weather, radarUrlTemplate, overlays.radarOpacity]);

  // ---- Route lines source/layer ----
  const routeFC = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    loads.forEach((load) => {
      let coords: [number, number][] | null = null;
      if (load.liveRouteGeometry && load.liveRouteGeometry.length >= 2) {
        // liveRouteGeometry is [lat, lng]; Mapbox wants [lng, lat]
        coords = load.liveRouteGeometry.map(([la, ln]) => [ln, la] as [number, number]);
      } else if (load.originCoords && load.destCoords) {
        coords = [
          [load.originCoords.lng, load.originCoords.lat],
          [load.destCoords.lng, load.destCoords.lat],
        ];
      }
      if (!coords) return;
      features.push({
        type: 'Feature',
        id: loadFeatureId(load.id),
        properties: {
          id: load.id,
          live: !!load.liveRouteGeometry,
        },
        geometry: { type: 'LineString', coordinates: coords },
      });
    });
    return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection<GeoJSON.LineString>;
  }, [loads]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const SRC = 'load-routes';
    const LYR = 'load-routes-lyr';
    const LYR_SEL = 'load-routes-selected';
    try {
      const src = map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
      if (!src) {
        map.addSource(SRC, { type: 'geojson', data: routeFC });
        map.addLayer({
          id: LYR,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': [
              'case',
              ['get', 'live'],
              LIVE_ROUTE_COLOR,
              LOAD_STATUS_COLOR,
            ],
            'line-width': [
              'case',
              ['==', ['get', 'id'], selectedLoadId ?? ''],
              6,
              3.5,
            ],
            'line-opacity': 0.85,
          },
        });
      } else {
        src.setData(routeFC);
        map.setPaintProperty(LYR, 'line-width', [
          'case',
          ['==', ['get', 'id'], selectedLoadId ?? ''],
          6,
          3.5,
        ]);
      }
    } catch (err) {
      console.warn('Routes layer error:', err);
    }
  }, [routeFC, styleReady, selectedLoadId]);

  // ---- Origin/destination/stop symbol sources ----
  const pointFC = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    loads.forEach((load) => {
      if (load.originCoords) {
        features.push({
          type: 'Feature',
          properties: {
            kind: 'origin',
            loadId: load.id,
            label: load.origin,
            loadLabel: load.landstar_load_id || load.id.slice(0, 8),
          },
          geometry: {
            type: 'Point',
            coordinates: [load.originCoords.lng, load.originCoords.lat],
          },
        });
      }
      if (load.destCoords) {
        features.push({
          type: 'Feature',
          properties: {
            kind: 'destination',
            loadId: load.id,
            label: load.destination,
            loadLabel: load.landstar_load_id || load.id.slice(0, 8),
          },
          geometry: {
            type: 'Point',
            coordinates: [load.destCoords.lng, load.destCoords.lat],
          },
        });
      }
      load.stopCoords.forEach((sc) => {
        features.push({
          type: 'Feature',
          properties: {
            kind: 'stop',
            loadId: load.id,
            label: sc.stop.facilityName || sc.stop.address,
          },
          geometry: { type: 'Point', coordinates: [sc.lng, sc.lat] },
        });
      });
    });
    return {
      type: 'FeatureCollection',
      features,
    } as GeoJSON.FeatureCollection<GeoJSON.Point>;
  }, [loads]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const SRC = 'load-points';
    try {
      const src = map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
      if (!src) {
        map.addSource(SRC, { type: 'geojson', data: pointFC });
        map.addLayer({
          id: 'load-points-circle',
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': 6,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-color': [
              'match',
              ['get', 'kind'],
              'origin',
              '#22c55e',
              'destination',
              '#ef4444',
              'stop',
              '#f59e0b',
              '#3b82f6',
            ],
          },
        });
      } else {
        src.setData(pointFC);
      }
    } catch (err) {
      console.warn('Points layer error:', err);
    }
  }, [pointFC, styleReady]);

  // ---- Truck cluster source/layer ----
  const truckFC = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    loads.forEach((load) => {
      if (!load.truckCoords) return;
      features.push({
        type: 'Feature',
        properties: {
          loadId: load.id,
          live: load.isLiveLocation,
          unit: load.truck?.unit_number ?? '',
          driver: load.driver
            ? `${load.driver.first_name} ${load.driver.last_name}`
            : '',
          origin: load.origin,
          destination: load.destination,
        },
        geometry: {
          type: 'Point',
          coordinates: [load.truckCoords.lng, load.truckCoords.lat],
        },
      });
    });
    return {
      type: 'FeatureCollection',
      features,
    } as GeoJSON.FeatureCollection<GeoJSON.Point>;
  }, [loads]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const SRC = 'trucks';
    try {
      const src = map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
      if (!src) {
        map.addSource(SRC, {
          type: 'geojson',
          data: truckFC,
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 10,
        });
        map.addLayer({
          id: 'trucks-cluster',
          type: 'circle',
          source: SRC,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#3b82f6',
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              14,
              10,
              18,
              25,
              22,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9,
          },
        });
        map.addLayer({
          id: 'trucks-cluster-count',
          type: 'symbol',
          source: SRC,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: 'trucks-point',
          type: 'circle',
          source: SRC,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 8,
            'circle-color': [
              'case',
              ['boolean', ['get', 'live'], false],
              '#22c55e',
              '#3b82f6',
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        });

        map.on('click', 'trucks-point', (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const props = feat.properties as any;
          const loadId = props?.loadId as string | undefined;
          if (loadId) onSelectLoad(loadId);
          const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
          truckPopupRef.current?.remove();
          truckPopupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: true })
            .setLngLat(coords)
            .setHTML(
              `<div style="font-size:12px;min-width:150px">
                 <div style="font-weight:600">Unit ${props.unit ?? ''}</div>
                 ${props.driver ? `<div style="color:#6b7280">${props.driver}</div>` : ''}
                 <div style="margin-top:6px;color:#6b7280">${props.origin} → ${props.destination}</div>
               </div>`,
            )
            .addTo(map);
        });
        map.on('mouseenter', 'trucks-point', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'trucks-point', () => {
          map.getCanvas().style.cursor = '';
        });

        map.on('click', 'trucks-cluster', (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const clusterId = feat.properties?.cluster_id;
          const source = map.getSource(SRC) as mapboxgl.GeoJSONSource;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({
              center: (feat.geometry as GeoJSON.Point).coordinates as [number, number],
              zoom: zoom ?? map.getZoom() + 2,
            });
          });
        });

        map.on('click', 'load-points-circle', (e) => {
          const feat = e.features?.[0];
          const loadId = feat?.properties?.loadId as string | undefined;
          if (loadId) onSelectLoad(loadId);
        });
      } else {
        src.setData(truckFC);
      }

      // Visibility toggles
      const vis = overlays.trucks ? 'visible' : 'none';
      ['trucks-cluster', 'trucks-cluster-count', 'trucks-point'].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
      });
    } catch (err) {
      console.warn('Trucks layer error:', err);
    }
  }, [truckFC, styleReady, overlays.trucks, onSelectLoad]);

  // ---- Fit bounds when loads first arrive / when no selection ----
  const didInitialFitRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (didInitialFitRef.current) return;
    const bounds = new mapboxgl.LngLatBounds();
    let count = 0;
    loads.forEach((l) => {
      if (l.originCoords) {
        bounds.extend([l.originCoords.lng, l.originCoords.lat]);
        count++;
      }
      if (l.destCoords) {
        bounds.extend([l.destCoords.lng, l.destCoords.lat]);
        count++;
      }
      if (l.truckCoords) {
        bounds.extend([l.truckCoords.lng, l.truckCoords.lat]);
        count++;
      }
    });
    if (count >= 2) {
      map.fitBounds(bounds, { padding: 40, duration: 600, maxZoom: 8 });
      didInitialFitRef.current = true;
    }
  }, [loads, styleReady]);

  // ---- Auto-center to selected load ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !selectedLoadId) return;
    const load = loads.find((l) => l.id === selectedLoadId);
    if (!load) return;
    const bounds = new mapboxgl.LngLatBounds();
    let count = 0;
    if (load.originCoords) {
      bounds.extend([load.originCoords.lng, load.originCoords.lat]);
      count++;
    }
    if (load.destCoords) {
      bounds.extend([load.destCoords.lng, load.destCoords.lat]);
      count++;
    }
    if (load.truckCoords) {
      bounds.extend([load.truckCoords.lng, load.truckCoords.lat]);
      count++;
    }
    if (count >= 2) map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 9 });
    else if (count === 1) {
      const c = load.truckCoords ?? load.originCoords ?? load.destCoords;
      if (c) map.easeTo({ center: [c.lng, c.lat], zoom: 7 });
    }
  }, [selectedLoadId, loads, styleReady]);

  return (
    <div
      className={
        isExpanded
          ? 'relative w-full h-full overflow-hidden'
          : 'relative h-[360px] min-h-[360px] w-full rounded-lg overflow-hidden border border-border sm:h-[420px] xl:h-[520px]'
      }
    >
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {!styleReady && !mapError && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-background/70">
          <Skeleton className="h-full w-full" />
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-background/90 p-4 text-center">
          <div>
            <MapPin className="h-6 w-6 mx-auto mb-1 text-destructive" />
            <p className="text-sm font-medium">Map failed to load</p>
            <p className="text-xs text-muted-foreground mt-1">{mapError}</p>
          </div>
        </div>
      )}

      {loads.length === 0 && styleReady && !isExpanded && (
        <div className="absolute inset-x-0 top-3 mx-auto w-max px-3 py-1.5 rounded-full bg-background/85 backdrop-blur-sm border border-border text-xs text-muted-foreground z-10">
          No loads in transit
        </div>
      )}

      {/* Overlay control panel */}
      <div
        className={`absolute top-3 ${isExpanded ? 'right-3' : 'right-10'} z-10 max-w-[240px]`}
      >
        <div className="rounded-lg border border-border bg-background/90 backdrop-blur-sm shadow-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Map Overlays
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="traffic-toggle"
                className="flex items-center gap-2 text-xs font-medium cursor-pointer"
              >
                <TrafficCone className="h-3.5 w-3.5 text-amber-500" />
                Traffic
              </Label>
              <Switch
                id="traffic-toggle"
                checked={overlays.traffic}
                onCheckedChange={(v) =>
                  setOverlays((prev) => ({ ...prev, traffic: v }))
                }
              />
            </div>
            {overlays.traffic && (
              <div className="pl-6">
                <Slider
                  value={[overlays.trafficOpacity]}
                  onValueChange={([v]) =>
                    setOverlays((prev) => ({ ...prev, trafficOpacity: v }))
                  }
                  min={20}
                  max={100}
                  step={5}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="weather-toggle"
                className="flex items-center gap-2 text-xs font-medium cursor-pointer"
              >
                <Cloud className="h-3.5 w-3.5 text-sky-500" />
                Weather Radar
              </Label>
              <Switch
                id="weather-toggle"
                checked={overlays.weather}
                onCheckedChange={(v) =>
                  setOverlays((prev) => ({ ...prev, weather: v }))
                }
              />
            </div>
            {overlays.weather && (
              <div className="pl-6">
                <Slider
                  value={[overlays.radarOpacity]}
                  onValueChange={([v]) =>
                    setOverlays((prev) => ({ ...prev, radarOpacity: v }))
                  }
                  min={20}
                  max={100}
                  step={5}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="trucks-toggle"
                className="flex items-center gap-2 text-xs font-medium cursor-pointer"
              >
                <TruckIcon className="h-3.5 w-3.5 text-primary" />
                Trucks
              </Label>
              <Switch
                id="trucks-toggle"
                checked={overlays.trucks}
                onCheckedChange={(v) =>
                  setOverlays((prev) => ({ ...prev, trucks: v }))
                }
              />
            </div>
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 justify-between px-2 text-xs"
              >
                Legend
                <ChevronDown className="h-3 w-3" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded bg-[#22c55e]" /> Free flow
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded bg-[#eab308]" /> Moderate
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded bg-[#f97316]" /> Heavy
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded bg-[#dc2626]" /> Severe
              </div>
              <div className="h-px bg-border my-1" />
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#22c55e]" /> Origin
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Destination
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> Intermediate stop
              </div>
              <div className="flex items-center gap-2">
                <CloudSun className="h-3 w-3 text-sky-500" /> RainViewer radar
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {selectedLoadId && (
        <div className="absolute top-3 left-3 z-10">
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={() => onSelectLoad(null)}
          >
            Clear selection
          </Badge>
        </div>
      )}
    </div>
  );
}
