import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { MapContainer, TileLayer, Rectangle, Tooltip } from 'react-leaflet';
import { LatLngBoundsExpression } from 'leaflet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

type RegionStatus = 'pending' | 'fetching' | 'done' | 'error';

interface Region {
  name: string;
  bbox: [number, number, number, number]; // [south, west, north, east]
  status: RegionStatus;
  upserted?: number;
  error?: string;
}

const INITIAL_REGIONS: Omit<Region, 'status'>[] = [
  { name: 'Northeast',     bbox: [37.0, -82.0, 47.5, -66.5] },
  { name: 'Southeast',     bbox: [24.0, -92.0, 37.0, -75.0] },
  { name: 'Midwest',       bbox: [36.0, -104.0, 49.5, -82.0] },
  { name: 'South Central', bbox: [24.0, -104.0, 37.0, -92.0] },
  { name: 'Northwest',     bbox: [40.0, -125.0, 49.5, -104.0] },
  { name: 'Southwest',     bbox: [24.0, -125.0, 40.0, -104.0] },
];

const US_BOUNDS: LatLngBoundsExpression = [[24, -125], [50, -66]];

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function getRegionColor(status: RegionStatus) {
  switch (status) {
    case 'pending':  return { color: '#94a3b8', fillOpacity: 0.15, weight: 1, dashArray: undefined };
    case 'fetching': return { color: '#eab308', fillOpacity: 0.25, weight: 2, dashArray: '6 4' };
    case 'done':     return { color: '#22c55e', fillOpacity: 0.25, weight: 2, dashArray: undefined };
    case 'error':    return { color: '#ef4444', fillOpacity: 0.25, weight: 2, dashArray: undefined };
  }
}

function bboxToBounds(bbox: [number, number, number, number]): LatLngBoundsExpression {
  const [south, west, north, east] = bbox;
  return [[south, west], [north, east]];
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

interface SyncMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function SyncMapModal({ open, onOpenChange, onComplete }: SyncMapModalProps) {
  const [regions, setRegions] = useState<Region[]>(
    INITIAL_REGIONS.map(r => ({ ...r, status: 'pending' as RegionStatus }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [etaText, setEtaText] = useState('');
  const startTimeRef = useRef(0);

  const completedCount = regions.filter(r => r.status === 'done' || r.status === 'error').length;
  const totalUpserted = regions.reduce((s, r) => s + (r.upserted || 0), 0);
  const progress = regions.length > 0 ? (completedCount / regions.length) * 100 : 0;

  const runSync = useCallback(async () => {
    const fresh: Region[] = INITIAL_REGIONS.map(r => ({ ...r, status: 'pending' as RegionStatus }));
    setRegions(fresh);
    setIsRunning(true);
    setIsDone(false);
    setCurrentIndex(-1);
    setEtaText('Calculating...');
    startTimeRef.current = Date.now();

    const working = [...fresh];

    for (let i = 0; i < working.length; i++) {
      setCurrentIndex(i);
      working[i] = { ...working[i], status: 'fetching' };
      setRegions([...working]);

      try {
        const { data, error } = await supabase.functions.invoke('sync-official-truck-stops', {
          body: { bbox: working[i].bbox },
        });

        if (error) throw error;

        working[i] = { ...working[i], status: 'done', upserted: data?.upserted || 0 };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        working[i] = { ...working[i], status: 'error', error: msg };
      }

      setRegions([...working]);

      // ETA
      const done = working.filter(r => r.status === 'done' || r.status === 'error').length;
      const remaining = working.length - done;
      if (done > 0 && remaining > 0) {
        const elapsed = Date.now() - startTimeRef.current;
        const avgPerChunk = elapsed / done;
        setEtaText(formatEta((avgPerChunk * remaining) / 1000));
      } else if (remaining === 0) {
        setEtaText('');
      }

      // Rate limit delay between calls (skip after last)
      if (i < working.length - 1) {
        await delay(3000);
      }
    }

    const total = working.reduce((s, r) => s + (r.upserted || 0), 0);
    const errors = working.filter(r => r.status === 'error').length;

    if (errors > 0) {
      toast.warning(`Sync finished with ${errors} error(s). ${total} stops synced.`);
    } else {
      toast.success(`Sync complete! ${total} stops synced across ${working.length} regions.`);
    }

    setIsRunning(false);
    setIsDone(true);
    setCurrentIndex(-1);
    onComplete();
  }, [onComplete]);

  const statusIcon = (status: RegionStatus) => {
    switch (status) {
      case 'pending': return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case 'fetching': return <RefreshCw className="h-3.5 w-3.5 text-yellow-500 animate-spin" />;
      case 'done': return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'error': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={isRunning ? undefined : onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-lg font-semibold">Sync Official Truck Stops</DialogTitle>
        </DialogHeader>

        {/* Map */}
        <div className="h-72 w-full border-y border-border">
          <MapContainer
            bounds={US_BOUNDS}
            scrollWheelZoom={false}
            dragging={false}
            zoomControl={false}
            attributionControl={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {regions.map((region, idx) => {
              const style = getRegionColor(region.status);
              return (
                <Rectangle
                  key={region.name}
                  bounds={bboxToBounds(region.bbox)}
                  pathOptions={{
                    color: style.color,
                    fillColor: style.color,
                    fillOpacity: style.fillOpacity,
                    weight: style.weight,
                    dashArray: style.dashArray,
                  }}
                >
                  <Tooltip permanent={region.status === 'fetching' || region.status === 'done'} direction="center">
                    <span className="text-xs font-medium">
                      {region.name}
                      {region.status === 'done' && ` ✓ ${region.upserted}`}
                      {region.status === 'fetching' && ' ⏳'}
                      {region.status === 'error' && ' ✗'}
                    </span>
                  </Tooltip>
                </Rectangle>
              );
            })}
          </MapContainer>
        </div>

        {/* Progress section */}
        <div className="px-6 py-4 space-y-3">
          {/* Region chips */}
          <div className="flex flex-wrap gap-1.5">
            {regions.map((region) => (
              <Badge
                key={region.name}
                variant="outline"
                className="gap-1 text-xs"
              >
                {statusIcon(region.status)}
                {region.name}
                {region.upserted !== undefined && region.status === 'done' && (
                  <span className="text-muted-foreground ml-0.5">({region.upserted})</span>
                )}
              </Badge>
            ))}
          </div>

          {/* Progress bar */}
          <Progress value={progress} className="h-2.5" />

          {/* Status text */}
          <div className="text-sm text-muted-foreground">
            {!isRunning && !isDone && (
              <span>Click "Begin Sync" to start fetching truck stop data across 6 US regions.</span>
            )}
            {isRunning && currentIndex >= 0 && (
              <span>
                Fetching Region {currentIndex + 1} of {regions.length} — <strong>{regions[currentIndex]?.name}</strong>
                {etaText && <> · Est. remaining: <strong>{etaText}</strong></>}
              </span>
            )}
            {isDone && (
              <span className="text-green-600 dark:text-green-400 font-medium">
                Sync complete! {totalUpserted.toLocaleString()} stops synced across {regions.length} regions.
              </span>
            )}
          </div>

          {/* Action button */}
          <div className="flex justify-end gap-2 pt-1">
            {!isRunning && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {isDone ? 'Close' : 'Cancel'}
              </Button>
            )}
            <Button
              onClick={runSync}
              disabled={isRunning}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? 'Syncing...' : isDone ? 'Re-Sync' : 'Begin Sync'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
