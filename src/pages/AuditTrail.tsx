import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';
import { MetricsSnapshot } from '@/components/audit/MetricsSnapshot';
import { AuditFilters } from '@/components/audit/AuditFilters';
import { LiveActivityFeed } from '@/components/audit/LiveActivityFeed';
import { ExportCsvButton } from '@/components/audit/ExportCsvButton';
import { useAuditLogs, type AuditFilters as AuditFiltersT } from '@/hooks/useAuditLogs';

export default function AuditTrail() {
  const [filters, setFilters] = useState<AuditFiltersT>({ limit: 500 });
  const { data: rows = [], isLoading } = useAuditLogs(filters);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-md">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            Immutable, append-only record of every change across fleet, drivers, and settlements.
          </p>
        </div>
      </div>

      <MetricsSnapshot />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Live Activity Feed</CardTitle>
              <CardDescription>Streams new entries in real time. Newest first.</CardDescription>
            </div>
            <ExportCsvButton rows={rows} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuditFilters value={filters} onChange={(next) => setFilters({ ...next, limit: 500 })} />
          <LiveActivityFeed rows={rows} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
