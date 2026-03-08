import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DefectAlerts } from '@/components/safety/DefectAlerts';
import { InspectionHistory } from '@/components/safety/InspectionHistory';
import { DriverComplianceHub } from '@/components/safety/DriverComplianceHub';
import { NewWorkOrderSheet, WorkOrderInitialData } from '@/components/maintenance/NewWorkOrderSheet';
import { AlertTriangle, CheckCircle, Clock, Truck, Shield, Flame, CreditCard, User, ClipboardCheck, FileWarning, TrendingUp } from 'lucide-react';
import { format, addDays, isBefore, parseISO, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

interface AlertItem {
  id: string;
  name: string;
  subtitle: string;
  date: string;
  isExpired: boolean;
}

function AlertList({ alerts, emptyMessage }: { alerts: AlertItem[]; emptyMessage: string }) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map(alert => (
        <div key={alert.id} className={`flex items-center justify-between p-3 rounded-lg ${alert.isExpired ? 'bg-destructive/10' : 'bg-warning/10'}`}>
          <div>
            <p className="font-medium">{alert.name}</p>
            <p className="text-sm text-muted-foreground">{alert.subtitle}</p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-medium ${alert.isExpired ? 'text-destructive' : 'text-warning'}`}>
              {alert.isExpired ? 'EXPIRED' : 'Expiring'}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(alert.date), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Safety() {
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [workOrderInitialData, setWorkOrderInitialData] = useState<WorkOrderInitialData | undefined>();

  const handleConvertToWorkOrder = (data: { truck_id: string; description: string }) => {
    setWorkOrderInitialData({ truck_id: data.truck_id, description: data.description, service_types: ['repair'] });
    setWorkOrderOpen(true);
  };

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Fetch incidents for trend data (last 6 months)
  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-safety-trends'],
    queryFn: async () => {
      const sixMonthsAgo = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('incidents')
        .select('id, incident_date, incident_type, severity, status')
        .gte('incident_date', sixMonthsAgo)
        .order('incident_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Compute incident trend by month
  const incidentTrends = (() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const label = format(monthStart, 'MMM');
      const monthIncidents = incidents.filter(inc => {
        const d = new Date(inc.incident_date);
        return d >= monthStart && d <= monthEnd;
      });
      months.push({
        month: label,
        total: monthIncidents.length,
        critical: monthIncidents.filter(i => i.severity === 'critical' || i.severity === 'major').length,
      });
    }
    return months;
  })();

  const trendChartConfig = {
    total: { label: 'Total Incidents', color: 'hsl(var(--warning))' },
    critical: { label: 'Critical/Major', color: 'hsl(var(--destructive))' },
  };

  const today = new Date();
  const in30Days = addDays(today, 30);

  // Trucks with upcoming or overdue inspections
  const inspectionAlerts: AlertItem[] = trucks.filter(t => {
    if (!t.next_inspection_date) return false;
    const inspDate = parseISO(t.next_inspection_date);
    return isBefore(inspDate, in30Days);
  }).map(t => ({
    id: t.id,
    name: t.unit_number,
    subtitle: `${t.make || ''} ${t.model || ''}`.trim() || 'Truck',
    date: t.next_inspection_date!,
    isExpired: isBefore(parseISO(t.next_inspection_date!), today)
  }));

  // Drivers with license issues
  const licenseAlerts: AlertItem[] = drivers.filter(d => {
    if (!d.license_expiry) return false;
    const expDate = parseISO(d.license_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    subtitle: `License: ${d.license_number || 'N/A'}`,
    date: d.license_expiry!,
    isExpired: isBefore(parseISO(d.license_expiry!), today)
  }));

  // Drivers with medical card issues
  const medicalAlerts: AlertItem[] = drivers.filter(d => {
    if (!d.medical_card_expiry) return false;
    const expDate = parseISO(d.medical_card_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    subtitle: 'DOT Medical Card',
    date: d.medical_card_expiry!,
    isExpired: isBefore(parseISO(d.medical_card_expiry!), today)
  }));

  // Drivers with HAZMAT issues
  const hazmatAlerts: AlertItem[] = drivers.filter(d => {
    if (!d.hazmat_expiry) return false;
    const expDate = parseISO(d.hazmat_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    subtitle: 'HAZMAT Certification',
    date: d.hazmat_expiry!,
    isExpired: isBefore(parseISO(d.hazmat_expiry!), today)
  }));

  // Trucks that are down
  const downTrucks = trucks.filter(t => t.status === 'down' || t.status === 'out_of_service');

  const totalDriverAlerts = licenseAlerts.length + medicalAlerts.length + hazmatAlerts.length;
  const openIncidents = incidents.filter(i => i.status === 'reported' || i.status === 'under_review').length;

  return (
    <>
      <PageHeader title="Safety Dashboard" description="Monitor inspections, compliance, incidents, and alerts" />

      {/* Defect Alerts Banner */}
      <DefectAlerts onConvertToWorkOrder={handleConvertToWorkOrder} />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Truck Alerts</CardTitle>
            <Truck className={`h-4 w-4 ${inspectionAlerts.length + downTrucks.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inspectionAlerts.length + downTrucks.length}</div>
            <p className="text-xs text-muted-foreground">
              {inspectionAlerts.length} inspections, {downTrucks.length} down
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Driver Alerts</CardTitle>
            <User className={`h-4 w-4 ${totalDriverAlerts > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDriverAlerts}</div>
            <p className="text-xs text-muted-foreground">
              License, Medical, HAZMAT
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            <FileWarning className={`h-4 w-4 ${openIncidents > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openIncidents}</div>
            <p className="text-xs text-muted-foreground">Reported or under review</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fleet Status</CardTitle>
            <CheckCircle className={`h-4 w-4 ${downTrucks.length === 0 ? 'text-success' : 'text-destructive'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trucks.length - downTrucks.length}/{trucks.length}</div>
            <p className="text-xs text-muted-foreground">Trucks operational</p>
          </CardContent>
        </Card>
      </div>

      {/* Incident Trends Chart */}
      {incidents.length > 0 && (
        <Card className="card-elevated mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Incident Trends (6 Months)
            </CardTitle>
            <CardDescription>Monthly incident count breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="h-[200px]">
              <BarChart data={incidentTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="critical" fill="var(--color-critical)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Driver Compliance Hub */}
      <DriverComplianceHub />

      {/* Two-column: Inspection History + Compliance Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* DVIR / Inspection History */}
        <InspectionHistory showAllTrucks={true} />

        {/* Compliance Alerts */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Compliance Alerts</CardTitle>
            <CardDescription>Items requiring attention within 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="inspections" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="inspections" className="flex gap-1">
                  <Truck className="h-4 w-4" />
                  <span className="hidden sm:inline">Insp</span>
                  {inspectionAlerts.length > 0 && (
                    <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">
                      {inspectionAlerts.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="licenses" className="flex gap-1">
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">CDL</span>
                  {licenseAlerts.length > 0 && (
                    <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">
                      {licenseAlerts.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="medical" className="flex gap-1">
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Med</span>
                  {medicalAlerts.length > 0 && (
                    <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">
                      {medicalAlerts.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="hazmat" className="flex gap-1">
                  <Flame className="h-4 w-4" />
                  <span className="hidden sm:inline">HAZ</span>
                  {hazmatAlerts.length > 0 && (
                    <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">
                      {hazmatAlerts.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="down" className="flex gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="hidden sm:inline">Down</span>
                  {downTrucks.length > 0 && (
                    <span className="ml-1 rounded-full bg-destructive/20 px-1.5 py-0.5 text-xs font-medium text-destructive">
                      {downTrucks.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="inspections" className="mt-4">
                <AlertList alerts={inspectionAlerts} emptyMessage="All inspections are up to date" />
              </TabsContent>

              <TabsContent value="licenses" className="mt-4">
                <AlertList alerts={licenseAlerts} emptyMessage="All licenses are current" />
              </TabsContent>

              <TabsContent value="medical" className="mt-4">
                <AlertList alerts={medicalAlerts} emptyMessage="All medical cards are current" />
              </TabsContent>

              <TabsContent value="hazmat" className="mt-4">
                <AlertList alerts={hazmatAlerts} emptyMessage="All HAZMAT certifications are current" />
              </TabsContent>

              <TabsContent value="down" className="mt-4">
                {downTrucks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
                    <p>All trucks are operational</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {downTrucks.map(truck => (
                      <div key={truck.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/10">
                        <div>
                          <p className="font-medium">{truck.unit_number}</p>
                          <p className="text-sm text-muted-foreground">{truck.make} {truck.model}</p>
                        </div>
                        <StatusBadge status={truck.status} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Work Order Sheet for DVIR conversion */}
      <NewWorkOrderSheet
        open={workOrderOpen}
        onOpenChange={setWorkOrderOpen}
        initialData={workOrderInitialData}
      />
    </>
  );
}
