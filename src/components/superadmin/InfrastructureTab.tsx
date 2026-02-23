import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HardDrive, Database, RefreshCw, Fuel } from 'lucide-react';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function InfrastructureTab() {
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-storage-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('super_admin_storage_stats' as any);
      if (error) throw error;
      return data as { bucket_id: string; file_count: number; total_bytes: number }[];
    },
  });

  const { data: truckStopStats, refetch: refetchStops } = useQuery({
    queryKey: ['super-admin-truck-stop-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('official_truck_stops')
        .select('brand, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const brandCounts: Record<string, number> = {};
      let latestSync: string | null = null;
      for (const row of (data || [])) {
        const brand = (row as any).brand || 'Unknown';
        brandCounts[brand] = (brandCounts[brand] || 0) + 1;
        if (!latestSync) latestSync = (row as any).updated_at;
      }
      return { brandCounts, total: data?.length || 0, lastSync: latestSync };
    },
  });

  const totalFiles = data?.reduce((s, r) => s + (r.file_count ?? 0), 0) ?? 0;
  const totalBytes = data?.reduce((s, r) => s + (r.total_bytes ?? 0), 0) ?? 0;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('sync-official-truck-stops');
      if (error) throw error;
      
      const synced = result?.synced || {};
      const errors = result?.errors || [];
      const total = result?.total_in_database || 0;
      
      const brandSummary = Object.entries(synced)
        .map(([brand, count]) => `${brand}: ${count}`)
        .join(', ');
      
      if (errors.length > 0) {
        toast.warning(`Sync partial: ${total} total stops. ${errors.join('; ')}`);
      } else {
        toast.success(`Sync complete: ${total} total stops (${brandSummary})`);
      }
      
      refetchStops();
    } catch (e) {
      toast.error('Sync failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Storage Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Storage Usage by Bucket
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Bucket</TableHead>
                    <TableHead className="font-semibold text-right">Files</TableHead>
                    <TableHead className="font-semibold text-right">Total Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((row) => (
                    <TableRow key={row.bucket_id}>
                      <TableCell className="font-medium">{row.bucket_id}</TableCell>
                      <TableCell className="text-right">{row.file_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatBytes(row.total_bytes)}</TableCell>
                    </TableRow>
                  ))}
                  {(!data || data.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">No storage data</TableCell>
                    </TableRow>
                  )}
                  {data && data.length > 0 && (
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totalFiles.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatBytes(totalBytes)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Database Management - Official Truck Stops */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Database Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Fuel className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Official Truck Stop Data</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Sync store directories from Pilot/Flying J, Love's, and TA/Petro.
              </p>
            </div>
            <Button onClick={handleSync} disabled={syncing} variant="outline" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Official Truck Stop Data'}
            </Button>
          </div>

          {truckStopStats && truckStopStats.total > 0 && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Stops in Database</span>
                <Badge variant="secondary" className="text-base px-3">
                  {truckStopStats.total.toLocaleString()}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(truckStopStats.brandCounts).map(([brand, count]) => (
                  <Badge key={brand} variant="outline" className="gap-1">
                    {brand}: {(count as number).toLocaleString()}
                  </Badge>
                ))}
              </div>
              {truckStopStats.lastSync && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(truckStopStats.lastSync).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {truckStopStats && truckStopStats.total === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Fuel className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No truck stops synced yet. Click the button above to populate the database.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
