import { useState } from 'react';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface CriticalAlert {
  id: string;
  type: 'truck' | 'driver' | 'delivery' | 'expense' | 'maintenance';
  message: string;
  count?: number;
  link?: string;
}

interface CriticalAlertsBarProps {
  alerts: CriticalAlert[];
  isLoading?: boolean;
  onDismiss?: (id: string) => void;
}

const alertIcons: Record<CriticalAlert['type'], string> = {
  truck: '🚛',
  driver: '👤',
  delivery: '📦',
  expense: '💰',
  maintenance: '🔧',
};

export function CriticalAlertsBar({ alerts, isLoading, onDismiss }: CriticalAlertsBarProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id));
    onDismiss?.(id);
  };

  if (isLoading) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 flex-1" />
        </div>
      </div>
    );
  }

  if (visibleAlerts.length === 0) {
    return null;
  }

  // If only one alert, show it directly
  if (visibleAlerts.length === 1) {
    const alert = visibleAlerts[0];
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-sm font-medium text-destructive">
              {alertIcons[alert.type]} {alert.message}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 hover:bg-destructive/20"
            onClick={() => handleDismiss(alert.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Multiple alerts - show summary
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-destructive">
              {visibleAlerts.length} Critical Items Need Attention
            </span>
          </div>
          <div className="space-y-1.5">
            {visibleAlerts.slice(0, 4).map(alert => (
              <div key={alert.id} className="flex items-center justify-between group">
                <span className="text-xs text-muted-foreground truncate">
                  {alertIcons[alert.type]} {alert.message}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
                    onClick={() => handleDismiss(alert.id)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            ))}
            {visibleAlerts.length > 4 && (
              <span className="text-xs text-muted-foreground">
                +{visibleAlerts.length - 4} more...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
