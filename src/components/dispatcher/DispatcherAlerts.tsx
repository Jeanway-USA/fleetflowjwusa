import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Wrench, Shield, FileWarning, User, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { addDays, isBefore, format } from 'date-fns';

interface Alert {
  id: string;
  type: 'defect' | 'maintenance' | 'credential' | 'inspection';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  link: string;
}

export function DispatcherAlerts() {
  const navigate = useNavigate();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['dispatcher-alerts'],
    queryFn: async () => {
      const alertsList: Alert[] = [];
      const now = new Date();
      const in30Days = addDays(now, 30);
      const in14Days = addDays(now, 14);

      // Fetch unresolved defects from inspections
      const { data: defects } = await supabase
        .from('driver_inspections')
        .select('id, inspection_date, defect_notes, truck:trucks!driver_inspections_truck_id_fkey(unit_number)')
        .eq('defects_found', true)
        .eq('status', 'submitted')
        .order('inspection_date', { ascending: false })
        .limit(5);

      defects?.forEach(defect => {
        alertsList.push({
          id: `defect-${defect.id}`,
          type: 'defect',
          priority: 'high',
          title: `DVIR Defect - Unit ${(defect.truck as any)?.unit_number || 'Unknown'}`,
          description: defect.defect_notes?.slice(0, 50) || 'Defect reported',
          link: '/safety',
        });
      });

      // Fetch open maintenance requests
      const { data: maintenance } = await supabase
        .from('maintenance_requests')
        .select('id, issue_type, priority, truck:trucks!maintenance_requests_truck_id_fkey(unit_number)')
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false })
        .limit(5);

      maintenance?.forEach(req => {
        alertsList.push({
          id: `maint-${req.id}`,
          type: 'maintenance',
          priority: req.priority === 'urgent' ? 'high' : req.priority === 'high' ? 'high' : 'medium',
          title: `Maintenance - Unit ${(req.truck as any)?.unit_number || 'Unknown'}`,
          description: req.issue_type.replace(/_/g, ' '),
          link: '/maintenance',
        });
      });

      // Fetch drivers with expiring credentials
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, license_expiry, medical_card_expiry, hazmat_expiry')
        .eq('status', 'active');

      drivers?.forEach(driver => {
        if (driver.license_expiry && isBefore(new Date(driver.license_expiry), in30Days)) {
          alertsList.push({
            id: `cred-license-${driver.id}`,
            type: 'credential',
            priority: isBefore(new Date(driver.license_expiry), in14Days) ? 'high' : 'medium',
            title: `License Expiring - ${driver.first_name} ${driver.last_name}`,
            description: `Expires ${format(new Date(driver.license_expiry), 'MMM d, yyyy')}`,
            link: '/drivers',
          });
        }
        if (driver.medical_card_expiry && isBefore(new Date(driver.medical_card_expiry), in30Days)) {
          alertsList.push({
            id: `cred-medical-${driver.id}`,
            type: 'credential',
            priority: isBefore(new Date(driver.medical_card_expiry), in14Days) ? 'high' : 'medium',
            title: `Medical Card Expiring - ${driver.first_name} ${driver.last_name}`,
            description: `Expires ${format(new Date(driver.medical_card_expiry), 'MMM d, yyyy')}`,
            link: '/drivers',
          });
        }
      });

      // Fetch trucks with upcoming inspections
      const { data: trucks } = await supabase
        .from('trucks')
        .select('id, unit_number, next_inspection_date')
        .eq('status', 'active');

      trucks?.forEach(truck => {
        if (truck.next_inspection_date && isBefore(new Date(truck.next_inspection_date), in14Days)) {
          alertsList.push({
            id: `insp-${truck.id}`,
            type: 'inspection',
            priority: isBefore(new Date(truck.next_inspection_date), now) ? 'high' : 'medium',
            title: `Inspection Due - Unit ${truck.unit_number}`,
            description: `Due ${format(new Date(truck.next_inspection_date), 'MMM d, yyyy')}`,
            link: '/trucks',
          });
        }
      });

      // Sort by priority
      return alertsList.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }).slice(0, 10);
    },
  });

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'defect': return FileWarning;
      case 'maintenance': return Wrench;
      case 'credential': return User;
      case 'inspection': return Truck;
      default: return AlertTriangle;
    }
  };

  const getPriorityColor = (priority: Alert['priority']) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      case 'low': return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const highPriorityCount = alerts?.filter(a => a.priority === 'high').length || 0;

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Alerts & Actions
            </CardTitle>
            <CardDescription>
              {alerts?.length || 0} items • {highPriorityCount} urgent
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {alerts && alerts.length > 0 ? (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {alerts.map((alert) => {
              const Icon = getAlertIcon(alert.type);
              
              return (
                <div
                  key={alert.id}
                  className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(alert.link)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded ${getPriorityColor(alert.priority)}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{alert.title}</p>
                        {alert.priority === 'high' && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs shrink-0">
                            Urgent
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {alert.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No alerts at this time</p>
            <p className="text-xs mt-1">All systems operational</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
