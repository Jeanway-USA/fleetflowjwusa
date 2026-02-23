import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Building2, Users, TrendingUp, Shield, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { OrgDetailSheet } from '@/components/superadmin/OrgDetailSheet';
import { AuditLogDetailSheet } from '@/components/superadmin/AuditLogDetailSheet';
import { OrgActionsDropdown } from '@/components/superadmin/OrgActionsDropdown';
import { EngagementTab } from '@/components/superadmin/EngagementTab';
import { InfrastructureTab } from '@/components/superadmin/InfrastructureTab';
import { ResetDemoDialog } from '@/components/superadmin/ResetDemoDialog';
import { BillingPromotionsTab } from '@/components/superadmin/BillingPromotionsTab';

const TIER_COLORS: Record<string, string> = {
  solo_bco: 'hsl(45, 80%, 45%)',
  fleet_owner: 'hsl(200, 70%, 50%)',
  agency: 'hsl(280, 60%, 55%)',
  all_in_one: 'hsl(142, 70%, 40%)',
};

const TIER_LABELS: Record<string, string> = {
  solo_bco: 'Solo BCO',
  fleet_owner: 'Fleet Owner',
  agency: 'Agency',
  all_in_one: 'All-in-One',
};

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [selectedOrg, setSelectedOrg] = useState<any | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [logSheetOpen, setLogSheetOpen] = useState(false);

  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ['super-admin-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_admin_dashboard_data' as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: orgs, isLoading: orgsLoading } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_admin_organizations' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: auditLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['super-admin-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_admin_audit_logs' as any)
        .select('*');
      if (error) throw error;
      return data as any[];
    },
  });

  const tierDistribution = dashboardData?.tier_distribution || [];

  const handleOrgClick = (org: any) => {
    setSelectedOrg(org);
    setSheetOpen(true);
  };

  const handleLogClick = (log: any) => {
    setSelectedLog(log);
    setLogSheetOpen(true);
  };

  return (
    <DashboardLayout>
      <PageHeader title="Super Admin Panel">
        <ResetDemoDialog />
      </PageHeader>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="gradient-gold text-primary-foreground">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Overview</TabsTrigger>
          <TabsTrigger value="organizations" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Organizations</TabsTrigger>
          <TabsTrigger value="engagement" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Engagement</TabsTrigger>
          <TabsTrigger value="infrastructure" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Infrastructure</TabsTrigger>
          <TabsTrigger value="health" className="data-[state=active]:bg-background data-[state=active]:text-foreground">System Health</TabsTrigger>
          <TabsTrigger value="billing" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Billing</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPICard title="Total Organizations" value={dashboardData?.total_orgs} loading={dashLoading} icon={<Building2 className="h-5 w-5" />} />
            <KPICard title="Signups (7 days)" value={dashboardData?.signups_7d} loading={dashLoading} icon={<TrendingUp className="h-5 w-5" />} />
            <KPICard title="Signups (30 days)" value={dashboardData?.signups_30d} loading={dashLoading} icon={<Users className="h-5 w-5" />} />
          </div>

          <Card>
            <CardHeader><CardTitle>Tier Distribution</CardTitle></CardHeader>
            <CardContent>
              {dashLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : tierDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={tierDistribution.map((t: any) => ({ name: TIER_LABELS[t.tier] || t.tier, value: t.count }))}
                      cx="50%" cy="50%" outerRadius={100} dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {tierDistribution.map((t: any, i: number) => (
                        <Cell key={i} fill={TIER_COLORS[t.tier] || 'hsl(0, 0%, 60%)'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-8">No data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Organizations */}
        <TabsContent value="organizations">
          <Card>
            <CardHeader><CardTitle>All Organizations</CardTitle></CardHeader>
            <CardContent>
              {orgsLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Org Name</TableHead>
                        <TableHead className="font-semibold">Tier</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Created</TableHead>
                        <TableHead className="font-semibold">Users</TableHead>
                        <TableHead className="font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs?.map((org: any) => (
                        <TableRow
                          key={org.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => handleOrgClick(org)}
                        >
                          <TableCell className="font-medium">{org.name}</TableCell>
                          <TableCell><Badge variant="secondary">{TIER_LABELS[org.subscription_tier] || org.subscription_tier}</Badge></TableCell>
                          <TableCell><Badge variant={org.is_active ? 'default' : 'destructive'}>{org.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                          <TableCell>{format(new Date(org.created_at), 'MMM d, yyyy')}</TableCell>
                          <TableCell>{org.user_count}</TableCell>
                          <TableCell><OrgActionsDropdown org={org} /></TableCell>
                        </TableRow>
                      ))}
                      {(!orgs || orgs.length === 0) && (
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
        </TabsContent>

        {/* Tab 3: Engagement */}
        <TabsContent value="engagement">
          <EngagementTab />
        </TabsContent>

        {/* Tab 4: Infrastructure */}
        <TabsContent value="infrastructure">
          <InfrastructureTab />
        </TabsContent>

        {/* Tab 5: System Health */}
        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Recent Audit Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Timestamp</TableHead>
                        <TableHead className="font-semibold">Organization</TableHead>
                        <TableHead className="font-semibold">User ID</TableHead>
                        <TableHead className="font-semibold">Action</TableHead>
                        <TableHead className="font-semibold">Table</TableHead>
                        <TableHead className="font-semibold">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs?.map((log: any) => (
                        <TableRow
                          key={log.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => handleLogClick(log)}
                        >
                          <TableCell className="text-xs">{format(new Date(log.created_at), 'MMM d, HH:mm:ss')}</TableCell>
                          <TableCell className="text-xs">{log.org_name || '—'}</TableCell>
                          <TableCell className="font-mono text-xs truncate max-w-[120px]">{log.user_id?.slice(0, 8)}…</TableCell>
                          <TableCell><Badge variant={log.action === 'DELETE' ? 'destructive' : 'secondary'}>{log.action}</Badge></TableCell>
                          <TableCell>{log.table_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{log.details ? JSON.stringify(log.details) : '—'}</TableCell>
                        </TableRow>
                      ))}
                      {(!auditLogs || auditLogs.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No audit logs found</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 6: Billing & Promotions */}
        <TabsContent value="billing">
          <BillingPromotionsTab />
        </TabsContent>
      </Tabs>

      <OrgDetailSheet org={selectedOrg} open={sheetOpen} onOpenChange={setSheetOpen} />
      <AuditLogDetailSheet log={selectedLog} open={logSheetOpen} onOpenChange={setLogSheetOpen} />
    </DashboardLayout>
  );
}

function KPICard({ title, value, loading, icon }: { title: string; value: number | undefined; loading: boolean; icon: React.ReactNode }) {
  return (
    <Card className="glow-gold">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-3xl font-bold">{value ?? 0}</p>}
      </CardContent>
    </Card>
  );
}
