import { Skeleton } from '@/components/ui/skeleton';

/**
 * Lightweight skeletons for Suspense fallbacks used by lazy-loaded
 * heavy components (recharts, leaflet, jspdf, xlsx, etc.).
 * Kept dependency-free so they ship in the main bundle.
 */

interface SizedProps {
  className?: string;
  height?: number | string;
}

export function ChartSkeleton({ className = '', height = 280 }: SizedProps) {
  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <Skeleton className="h-full w-full rounded-md" />
    </div>
  );
}

export function MapSkeleton({ className = '', height = 320 }: SizedProps) {
  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <Skeleton className="h-full w-full rounded-md" />
    </div>
  );
}

export function PanelSkeleton({ className = '', height = 240 }: SizedProps) {
  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <Skeleton className="h-full w-full rounded-md" />
    </div>
  );
}

export function DialogSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
