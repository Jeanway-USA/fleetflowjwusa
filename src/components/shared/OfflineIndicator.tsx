import { WifiOff, RefreshCw, Wifi } from 'lucide-react';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

export function OfflineIndicator() {
  const { isOnline, pendingCount, isSyncing } = useOfflineQueue();

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 animate-pulse">
        <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin" />
        <span className="text-xs font-semibold text-primary">Syncing...</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
        <WifiOff className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          Offline{pendingCount > 0 ? ` — ${pendingCount} pending` : ''}
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
        <Wifi className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          {pendingCount} pending sync
        </span>
      </div>
    );
  }

  return null;
}
