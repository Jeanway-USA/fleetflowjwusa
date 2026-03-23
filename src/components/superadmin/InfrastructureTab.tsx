import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { HardDrive, FileText, Truck, Users, Package, Cloud, Database } from 'lucide-react';

interface InfraRow {
  org_id: string;
  org_name: string;
  is_active: boolean;
  storage_provider: string;
  storage_connected: boolean;
  storage_connected_at: string | null;
  document_count: number;
  load_count: number;
  truck_count: number;
  driver_count: number;
}

export function InfrastructureTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-infrastructure-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_admin_infrastructure_stats' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as InfraRow[];
    },
  });

  const totalDocs = data?.reduce((s, r) => s + r.document_count, 0) ?? 0;
  const totalLoads = data?.reduce((s, r) => s + r.load_count, 0) ?? 0;
  const totalTrucks = data?.reduce((s, r) => s + r.truck_count, 0) ?? 0;
  const totalDrivers = data?.reduce((s, r) => s + r.driver_count, 0) ?? 0;
  const gdriveOrgs = data?.filter(r => r.storage_provider === 'google_drive').length ?? 0;
  const builtInOrgs = (data?.length ?? 0) - gdriveOrgs;

  const kpis = [
    { label: 'Documents', value: totalDocs, icon: FileText },
    { label: 'Loads', value: totalLoads, icon: Package },
    { label: 'Trucks', value: totalTrucks, icon: Truck },
    { label: 'Drivers', value: totalDrivers, icon: Users },
  ];

  const sorted = [...(data ?? [])].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.org_name.localeCompare(b.org_name);
  });

  return (
    <div className="space-y-6">
      {/* Platform Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-6 flex items-center gap-3">
              <k.icon className="h-8 w-8 text-primary opacity-70" />
              <div>
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{k.value.toLocaleString()}</p>
                )}
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Storage Adoption */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Storage Provider Adoption
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Badge variant="secondary" className="text-sm gap-1.5 px-3 py-1">
            <Database className="h-3.5 w-3.5" />
            Built-in: {isLoading ? '…' : builtInOrgs}
          </Badge>
          <Badge variant="outline" className="text-sm gap-1.5 px-3 py-1">
            <Cloud className="h-3.5 w-3.5" />
            Google Drive: {isLoading ? '…' : gdriveOrgs}
          </Badge>
        </CardContent>
      </Card>

      {/* Per-Org Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Organization Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Organization</TableHead>
                    <TableHead className="font-semibold">Storage</TableHead>
                    <TableHead className="font-semibold text-right">Docs</TableHead>
                    <TableHead className="font-semibold text-right">Loads</TableHead>
                    <TableHead className="font-semibold text-right">Trucks</TableHead>
                    <TableHead className="font-semibold text-right">Drivers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(row => (
                    <TableRow key={row.org_id} className={!row.is_active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">
                        {row.org_name}
                        {!row.is_active && (
                          <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.storage_provider === 'google_drive' ? 'outline' : 'secondary'} className="text-xs">
                          {row.storage_provider === 'google_drive' ? 'Google Drive' : 'Built-in'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.document_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.load_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.truck_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.driver_count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No organizations found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
