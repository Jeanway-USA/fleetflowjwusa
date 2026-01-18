import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle, Clock, Truck, Shield, Flame, CreditCard, User } from 'lucide-react';
import { format, addDays, isBefore, parseISO } from 'date-fns';

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

  return (
    <DashboardLayout>
      <PageHeader title="Safety Dashboard" description="Monitor inspections, compliance, and alerts" />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
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
            <CardTitle className="text-sm font-medium">Fleet Status</CardTitle>
            <CheckCircle className={`h-4 w-4 ${downTrucks.length === 0 ? 'text-success' : 'text-destructive'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trucks.length - downTrucks.length}/{trucks.length}</div>
            <p className="text-xs text-muted-foreground">Trucks operational</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Alert Details */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Compliance Alerts</CardTitle>
          <CardDescription>Items requiring attention within 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="inspections" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="inspections" className="flex gap-2">
                <Truck className="h-4 w-4" />
                <span className="hidden sm:inline">Inspections</span>
                {inspectionAlerts.length > 0 && (
                  <span className="ml-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                    {inspectionAlerts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="licenses" className="flex gap-2">
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Licenses</span>
                {licenseAlerts.length > 0 && (
                  <span className="ml-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                    {licenseAlerts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="medical" className="flex gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Medical</span>
                {medicalAlerts.length > 0 && (
                  <span className="ml-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                    {medicalAlerts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="hazmat" className="flex gap-2">
                <Flame className="h-4 w-4" />
                <span className="hidden sm:inline">HAZMAT</span>
                {hazmatAlerts.length > 0 && (
                  <span className="ml-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                    {hazmatAlerts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="down" className="flex gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">Down</span>
                {downTrucks.length > 0 && (
                  <span className="ml-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
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
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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
    </DashboardLayout>
  );
}
