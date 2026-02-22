import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { HardDrive } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function InfrastructureTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-storage-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('super_admin_storage_stats' as any);
      if (error) throw error;
      return data as { bucket_id: string; file_count: number; total_bytes: number }[];
    },
  });

  const totalFiles = data?.reduce((s, r) => s + (r.file_count ?? 0), 0) ?? 0;
  const totalBytes = data?.reduce((s, r) => s + (r.total_bytes ?? 0), 0) ?? 0;

  return (
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
  );
}
