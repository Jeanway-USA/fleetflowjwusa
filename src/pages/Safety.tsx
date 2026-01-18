import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AlertTriangle, CheckCircle, Clock, Truck, Shield, Flame } from 'lucide-react';
import { format, addDays, isBefore, parseISO } from 'date-fns';

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
  const inspectionAlerts = trucks.filter(t => {
    if (!t.next_inspection_date) return false;
    const inspDate = parseISO(t.next_inspection_date);
    return isBefore(inspDate, in30Days);
  }).map(t => ({
    ...t,
    isOverdue: t.next_inspection_date ? isBefore(parseISO(t.next_inspection_date), today) : false
  }));

  // Drivers with license issues
  const licenseAlerts = drivers.filter(d => {
    if (!d.license_expiry) return false;
    const expDate = parseISO(d.license_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    ...d,
    isExpired: d.license_expiry ? isBefore(parseISO(d.license_expiry), today) : false
  }));

  // Drivers with medical card issues
  const medicalAlerts = drivers.filter(d => {
    if (!d.medical_card_expiry) return false;
    const expDate = parseISO(d.medical_card_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    ...d,
    isExpired: d.medical_card_expiry ? isBefore(parseISO(d.medical_card_expiry), today) : false
  }));

  // Drivers with HAZMAT issues
  const hazmatAlerts = drivers.filter(d => {
    if (!d.hazmat_expiry) return false;
    const expDate = parseISO(d.hazmat_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    ...d,
    isExpired: d.hazmat_expiry ? isBefore(parseISO(d.hazmat_expiry), today) : false
  }));

  // Trucks that are down
  const downTrucks = trucks.filter(t => t.status === 'down' || t.status === 'out_of_service');

  return (
    <DashboardLayout>
      <PageHeader title="Safety Dashboard" description="Monitor inspections, compliance, and alerts" />

      <div className="grid gap-6 md:grid-cols-5 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inspection Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${inspectionAlerts.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inspectionAlerts.length}</div>
            <p className="text-xs text-muted-foreground">Due within 30 days</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">License Alerts</CardTitle>
            <Clock className={`h-4 w-4 ${licenseAlerts.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{licenseAlerts.length}</div>
            <p className="text-xs text-muted-foreground">Expiring within 30 days</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Medical Card Alerts</CardTitle>
            <Shield className={`h-4 w-4 ${medicalAlerts.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{medicalAlerts.length}</div>
            <p className="text-xs text-muted-foreground">Expiring within 30 days</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">HAZMAT Alerts</CardTitle>
            <Flame className={`h-4 w-4 ${hazmatAlerts.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hazmatAlerts.length}</div>
            <p className="text-xs text-muted-foreground">Expiring within 30 days</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Down Trucks</CardTitle>
            <Truck className={`h-4 w-4 ${downTrucks.length > 0 ? 'text-destructive' : 'text-success'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{downTrucks.length}</div>
            <p className="text-xs text-muted-foreground">Currently out of service</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Inspection Alerts */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Upcoming Inspections</CardTitle>
            <CardDescription>Trucks requiring inspection soon</CardDescription>
          </CardHeader>
          <CardContent>
            {inspectionAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
                <p>All inspections are up to date</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inspectionAlerts.map(truck => (
                  <div key={truck.id} className={`flex items-center justify-between p-3 rounded-lg ${truck.isOverdue ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                    <div>
                      <p className="font-medium">{truck.unit_number}</p>
                      <p className="text-sm text-muted-foreground">{truck.make} {truck.model}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${truck.isOverdue ? 'text-destructive' : 'text-warning'}`}>
                        {truck.isOverdue ? 'OVERDUE' : 'Due'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {truck.next_inspection_date && format(parseISO(truck.next_inspection_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* License Alerts */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>License Expirations</CardTitle>
            <CardDescription>Drivers with expiring licenses</CardDescription>
          </CardHeader>
          <CardContent>
            {licenseAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
                <p>All licenses are current</p>
              </div>
            ) : (
              <div className="space-y-3">
                {licenseAlerts.map(driver => (
                  <div key={driver.id} className={`flex items-center justify-between p-3 rounded-lg ${driver.isExpired ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                    <div>
                      <p className="font-medium">{driver.first_name} {driver.last_name}</p>
                      <p className="text-sm text-muted-foreground">License: {driver.license_number || 'N/A'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${driver.isExpired ? 'text-destructive' : 'text-warning'}`}>
                        {driver.isExpired ? 'EXPIRED' : 'Expiring'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {driver.license_expiry && format(parseISO(driver.license_expiry), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Medical Card Alerts */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>DOT Medical Card Expirations</CardTitle>
            <CardDescription>Drivers with expiring medical cards</CardDescription>
          </CardHeader>
          <CardContent>
            {medicalAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
                <p>All medical cards are current</p>
              </div>
            ) : (
              <div className="space-y-3">
                {medicalAlerts.map(driver => (
                  <div key={driver.id} className={`flex items-center justify-between p-3 rounded-lg ${driver.isExpired ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                    <div>
                      <p className="font-medium">{driver.first_name} {driver.last_name}</p>
                      <p className="text-sm text-muted-foreground">DOT Medical Card</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${driver.isExpired ? 'text-destructive' : 'text-warning'}`}>
                        {driver.isExpired ? 'EXPIRED' : 'Expiring'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {driver.medical_card_expiry && format(parseISO(driver.medical_card_expiry), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* HAZMAT Alerts */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>HAZMAT Expirations</CardTitle>
            <CardDescription>Drivers with expiring HAZMAT certifications</CardDescription>
          </CardHeader>
          <CardContent>
            {hazmatAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
                <p>All HAZMAT certifications are current</p>
              </div>
            ) : (
              <div className="space-y-3">
                {hazmatAlerts.map(driver => (
                  <div key={driver.id} className={`flex items-center justify-between p-3 rounded-lg ${driver.isExpired ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                    <div>
                      <p className="font-medium">{driver.first_name} {driver.last_name}</p>
                      <p className="text-sm text-muted-foreground">HAZMAT Certification</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${driver.isExpired ? 'text-destructive' : 'text-warning'}`}>
                        {driver.isExpired ? 'EXPIRED' : 'Expiring'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {driver.hazmat_expiry && format(parseISO(driver.hazmat_expiry), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Down Trucks */}
        <Card className="card-elevated lg:col-span-4">
          <CardHeader>
            <CardTitle>Out of Service Trucks</CardTitle>
            <CardDescription>Trucks currently down or out of service</CardDescription>
          </CardHeader>
          <CardContent>
            {downTrucks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
                <p>All trucks are operational</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
