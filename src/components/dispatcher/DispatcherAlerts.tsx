import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Wrench, Shield, FileWarning, User, Truck, Clock, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { addDays, isBefore, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

interface Alert {
  id: string;
  type: 'defect' | 'maintenance' | 'credential' | 'inspection' | 'detention';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  link: string;
  detentionData?: {
    requestId: string;
    driverId: string;
    loadId: string;
    notes: string;
  };
}

export function DispatcherAlerts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [responseDialog, setResponseDialog] = useState<{ open: boolean; alert: Alert | null; action: 'approve' | 'deny' }>({
    open: false,
    alert: null,
    action: 'approve',
  });
  const [responseNotes, setResponseNotes] = useState('');

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['dispatcher-alerts'],
    queryFn: async () => {
      const alertsList: Alert[] = [];
      const now = new Date();
      const in30Days = addDays(now, 30);
      const in14Days = addDays(now, 14);

      // Fetch pending detention requests
      const { data: detentionRequests } = await supabase
        .from('detention_requests')
        .select(`
          id,
          notes,
          created_at,
          driver_id,
          load_id,
          driver:drivers!detention_requests_driver_id_fkey(first_name, last_name),
          load:fleet_loads!detention_requests_load_id_fkey(landstar_load_id, origin, destination)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      detentionRequests?.forEach(req => {
        const driver = req.driver as any;
        const load = req.load as any;
        alertsList.push({
          id: `detention-${req.id}`,
          type: 'detention',
          priority: 'high',
          title: `Detention Request - ${driver?.first_name} ${driver?.last_name}`,
          description: `Load ${load?.landstar_load_id || 'N/A'}: ${req.notes?.slice(0, 50) || 'No details'}${req.notes && req.notes.length > 50 ? '...' : ''}`,
          link: '/fleet-loads',
          detentionData: {
            requestId: req.id,
            driverId: req.driver_id,
            loadId: req.load_id,
            notes: req.notes || '',
          },
        });
      });

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

      // Sort by priority (detention requests first, then by priority)
      return alertsList.sort((a, b) => {
        // Detention requests always first
        if (a.type === 'detention' && b.type !== 'detention') return -1;
        if (b.type === 'detention' && a.type !== 'detention') return 1;
        
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }).slice(0, 15);
    },
  });

  const respondToDetention = useMutation({
    mutationFn: async ({ requestId, driverId, action, notes }: { requestId: string; driverId: string; action: 'approve' | 'deny'; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update the detention request status
      const { error: updateError } = await supabase
        .from('detention_requests')
        .update({
          status: action === 'approve' ? 'approved' : 'denied',
          response_notes: notes,
          responded_by: user?.id,
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Create notification for the driver
      const { error: notifyError } = await supabase
        .from('driver_notifications')
        .insert({
          driver_id: driverId,
          title: action === 'approve' ? 'Detention Request Approved' : 'Detention Request Denied',
          message: action === 'approve' 
            ? `Your detention request has been approved.${notes ? ` Notes: ${notes}` : ''}`
            : `Your detention request was not approved.${notes ? ` Reason: ${notes}` : ''}`,
          notification_type: 'detention_response',
        });

      if (notifyError) throw notifyError;
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.action === 'approve' ? 'Request Approved' : 'Request Denied',
        description: 'The driver has been notified.',
      });
      queryClient.invalidateQueries({ queryKey: ['dispatcher-alerts'] });
      setResponseDialog({ open: false, alert: null, action: 'approve' });
      setResponseNotes('');
    },
    onError: (error) => {
      console.error('Error responding to detention:', error);
      toast({
        title: 'Error',
        description: 'Failed to process the request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleDetentionAction = (alert: Alert, action: 'approve' | 'deny') => {
    setResponseDialog({ open: true, alert, action });
  };

  const handleSubmitResponse = () => {
    if (!responseDialog.alert?.detentionData) return;
    
    respondToDetention.mutate({
      requestId: responseDialog.alert.detentionData.requestId,
      driverId: responseDialog.alert.detentionData.driverId,
      action: responseDialog.action,
      notes: responseNotes,
    });
  };

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'defect': return FileWarning;
      case 'maintenance': return Wrench;
      case 'credential': return User;
      case 'inspection': return Truck;
      case 'detention': return Clock;
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
  const detentionCount = alerts?.filter(a => a.type === 'detention').length || 0;

  return (
    <>
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
                {detentionCount > 0 && ` • ${detentionCount} detention`}
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
                    className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded ${getPriorityColor(alert.priority)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{alert.title}</p>
                          {alert.type === 'detention' && (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs shrink-0">
                              Action Required
                            </Badge>
                          )}
                          {alert.priority === 'high' && alert.type !== 'detention' && (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs shrink-0">
                              Urgent
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {alert.description}
                        </p>
                        
                        {/* Detention request actions */}
                        {alert.type === 'detention' && alert.detentionData && (
                          <div className="flex items-center gap-2 mt-2">
                            <Button 
                              size="sm" 
                              variant="default"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleDetentionAction(alert, 'approve')}
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleDetentionAction(alert, 'deny')}
                            >
                              <X className="h-3 w-3" />
                              Deny
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {/* Navigate button for non-detention alerts */}
                      {alert.type !== 'detention' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => navigate(alert.link)}
                        >
                          View
                        </Button>
                      )}
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

      {/* Response Dialog */}
      <Dialog open={responseDialog.open} onOpenChange={(open) => setResponseDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {responseDialog.action === 'approve' ? 'Approve Detention Request' : 'Deny Detention Request'}
            </DialogTitle>
            <DialogDescription>
              {responseDialog.alert?.detentionData?.notes && (
                <span className="block mt-2 p-2 bg-muted rounded text-sm">
                  <strong>Driver's notes:</strong> {responseDialog.alert.detentionData.notes}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="response-notes">
                {responseDialog.action === 'approve' ? 'Notes (optional)' : 'Reason for denial (optional)'}
              </Label>
              <Textarea
                id="response-notes"
                placeholder={responseDialog.action === 'approve' 
                  ? 'Add any notes for the driver...'
                  : 'Explain why the request was denied...'}
                value={responseNotes}
                onChange={(e) => setResponseNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseDialog({ open: false, alert: null, action: 'approve' })}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitResponse}
              disabled={respondToDetention.isPending}
              variant={responseDialog.action === 'deny' ? 'destructive' : 'default'}
            >
              {respondToDetention.isPending ? 'Processing...' : responseDialog.action === 'approve' ? 'Approve' : 'Deny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
