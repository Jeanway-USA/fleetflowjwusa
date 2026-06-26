import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertOctagon } from 'lucide-react';
import { useAuditMetrics } from '@/hooks/useAuditLogs';

export function MetricsSnapshot() {
  const { data, isLoading } = useAuditMetrics();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Actions (24h)</CardTitle>
          <Activity className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tabular-nums">{isLoading ? '—' : data?.total24h ?? 0}</div>
          <p className="text-xs text-muted-foreground mt-1">Logged mutations across all tracked tables.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Critical Overrides (24h)</CardTitle>
          <AlertOctagon className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tabular-nums text-destructive">
            {isLoading ? '—' : data?.critical24h ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Deletions and settlement/driver updates.</p>
        </CardContent>
      </Card>
    </div>
  );
}
