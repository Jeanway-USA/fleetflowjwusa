import { useEffect, useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapSkeleton } from '@/components/shared/LazyFallbacks';

/**
 * Maps are the heaviest thing on the site (about half a megabyte compressed). This holds the map back until the rest
 * of the page is up, and on a slow or data-saving connection waits for a tap instead of using the data on its own.
 */

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** True on a data-saver setting or a 2G/3G connection, where a half-megabyte map should be the person's choice. */
export function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!c) return false;
  return !!c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
}

export function DeferredMap({ children, height = 360 }: { children: ReactNode; height?: number }) {
  const [slow] = useState(isSlowConnection);
  const [go, setGo] = useState(false);

  // Fast connection: start the map once the page has had a moment to paint and respond.
  useEffect(() => {
    if (slow) return;
    const id: number =
      typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(() => setGo(true), { timeout: 1500 }) : window.setTimeout(() => setGo(true), 600);
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, [slow]);

  if (go) return <>{children}</>;

  if (slow) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card p-6 text-center" style={{ minHeight: height }}>
        <MapPin className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-semibold">The map is paused to save your data</p>
          <p className="text-sm text-muted-foreground">It is about half a megabyte. Load it when you need it.</p>
        </div>
        <Button className="h-11" onClick={() => setGo(true)}>Load the map</Button>
      </div>
    );
  }

  return <MapSkeleton height={height} />;
}
