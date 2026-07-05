import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  syncEmployeeToGusto,
  getEmployeesOnboardingStatus,
  type EmployeeOnboardingStatus,
} from '@/services/gustoCompanyApi';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, UserPlus } from 'lucide-react';

interface W2DriverRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  gusto_employee_id: string | null;
}

type DocStatus = 'not_synced' | 'pending' | 'complete' | 'unknown';

function docStatusBadge(status: DocStatus) {
  switch (status) {
    case 'complete':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
          Forms complete
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
          Forms pending
        </Badge>
      );
    case 'not_synced':
      return <Badge variant="secondary">Not synced</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

export function W2DriverSyncDashboard() {
  const qc = useQueryClient();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Strictly W-2 company drivers; Independent Owner-Operators are excluded server-side.
  const driversQuery = useQuery({
    queryKey: ['w2_driver_sync_dashboard'],
    queryFn: async (): Promise<W2DriverRow[]> => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, email, employment_type, gusto_employee_id')
        .eq('employment_type', 'w2_company')
        .order('first_name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        first_name: d.first_name,
        last_name: d.last_name,
        email: d.email,
        gusto_employee_id: d.gusto_employee_id ?? null,
      }));
    },
  });

  const drivers = driversQuery.data ?? [];
  const syncedUuids = useMemo(
    () => drivers.map((d) => d.gusto_employee_id).filter((v): v is string => !!v),
    [drivers],
  );

  const onboardingQuery = useQuery({
    queryKey: ['w2_onboarding_status', syncedUuids.join(',')],
    enabled: syncedUuids.length > 0,
    queryFn: async () => {
      const res = await getEmployeesOnboardingStatus(syncedUuids);
      if (!res.ok) throw new Error(res.error ?? 'Failed to load onboarding status');
      const map = new Map<string, EmployeeOnboardingStatus>();
      for (const s of res.data?.statuses ?? []) map.set(s.employee_uuid, s);
      return map;
    },
  });

  const statusMap = onboardingQuery.data;

  function resolveDocStatus(driver: W2DriverRow): DocStatus {
    if (!driver.gusto_employee_id) return 'not_synced';
    const s = statusMap?.get(driver.gusto_employee_id);
    if (!s) return 'unknown';
    if (s.w4_signed && s.i9_signed) return 'complete';
    return 'pending';
  }

  async function handleSync(driver: W2DriverRow) {
    setSyncingId(driver.id);
    try {
      const res = await syncEmployeeToGusto(driver.id);
      if (!res.ok) throw new Error(res.error ?? 'Sync failed');
      if (res.data?.existed) {
        toast.info(`${driver.first_name ?? 'Driver'} was already synced to Gusto.`);
      } else {
        toast.success(`${driver.first_name ?? 'Driver'} synced to Gusto.`);
      }
      await qc.invalidateQueries({ queryKey: ['w2_driver_sync_dashboard'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  }

  function handleRefresh() {
    driversQuery.refetch();
    if (syncedUuids.length > 0) onboardingQuery.refetch();
  }

  const loading = driversQuery.isLoading;

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>W-2 Driver Sync</CardTitle>
          <CardDescription>
            Sync your W-2 company drivers to Gusto and monitor W-4 / I-9 form
            completion. Independent Owner-Operator drivers are not shown here.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || onboardingQuery.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${onboardingQuery.isFetching ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading drivers…
          </div>
        ) : drivers.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No W-2 company drivers. Switch a driver's employment type to W-2 to
            see them here.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Gusto ID</TableHead>
                  <TableHead>Document Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => {
                  const fullName =
                    `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || '—';
                  const status = resolveDocStatus(d);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{fullName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.email ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.gusto_employee_id ? (
                          <span title={d.gusto_employee_id}>
                            {d.gusto_employee_id.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not synced</span>
                        )}
                      </TableCell>
                      <TableCell>{docStatusBadge(status)}</TableCell>
                      <TableCell className="text-right">
                        {d.gusto_employee_id ? (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-200">
                            Synced
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleSync(d)}
                            disabled={syncingId === d.id}
                          >
                            {syncingId === d.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <UserPlus className="h-4 w-4 mr-2" />
                            )}
                            Sync to Gusto
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default W2DriverSyncDashboard;
