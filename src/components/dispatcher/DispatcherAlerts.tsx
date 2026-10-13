import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Panel } from '@/components/finance/statement-ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Wrench, Shield, FileWarning, User, Truck, Clock, Check, X, Home, CalendarDays, PackageX, UserX } from 'lucide-react';
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
import { useState, useEffect } from 'react';
import { cityState } from '@/lib/formatters';
import { OPEN_STATUSES, isPastDue } from '@/lib/dispatch';

interface Alert {
  id: string;
  type: 'defect' | 'maintenance' | 'credential' | 'inspection' | 'driver_request' | 'detention_timer' | 'past_due' | 'no_driver';
  requestType?: 'detention' | 'home_time' | 'pto' | 'maintenance';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  link: string;
  /** What to do about it, in a sentence. */
  next: string;
  requestData?: {
    requestId: string;
    driverId: string;
    notes: string;
    startDate?: string | null;
    endDate?: string | null;
  };
}

const ARRIVAL_STATUSES = ['at_pickup', 'at_delivery', 'loading', 'unloading'] as const;

export function DispatcherAlerts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [responseDialog, setResponseDialog] = useState<{ open: boolean; alert: Alert | null; action: 'approve' | 'deny' }>({
    open: false,
    alert: null,
    action: 'approve',
  });
  const [responseNotes, setResponseNotes] = useState('');

  // Realtime subscription: auto-refresh alerts when driver_requests change
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('dispatcher-alerts-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'driver_requests' },
          () => {
            queryClient.invalidateQueries({ queryKey: ['dispatcher-alerts'] });
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription unavailable:', err);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['dispatcher-alerts'],
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const alertsList: Alert[] = [];
      const now = new Date();
      const in30Days = addDays(now, 30);
      const in14Days = addDays(now, 14);

      // Fetch pending driver requests (unified)
      const { data: driverRequests } = await supabase
        .from('driver_requests')
        .select(`
          id,
          request_type,
          subject,
          description,
          priority,
          created_at,
          driver_id,
          load_id,
          truck_id,
          start_date,
          end_date,
          driver:drivers!driver_requests_driver_id_fkey(first_name, last_name)
        `)
        .eq('status', 'pending')
        .neq('request_type', 'maintenance')
        .order('created_at', { ascending: false });

      driverRequests?.forEach(req => {
        const driver = req.driver as any;
        const driverName = `${driver?.first_name || ''} ${driver?.last_name || ''}`.trim();
        const typeLabel = req.request_type === 'home_time' ? 'Home Time'
          : req.request_type === 'pto' ? 'PTO'
          : req.request_type === 'detention' ? 'Detention'
          : 'Maintenance';

        alertsList.push({
          id: `req-${req.id}`,
          type: 'driver_request',
          requestType: req.request_type as any,
          priority: req.priority === 'critical' ? 'high' : req.priority === 'high' ? 'high' : 'medium',
          title: `${typeLabel} — ${driverName}`,
          description: req.subject || 'No subject',
          link: '/fleet-loads',
          next: 'Approve or deny. The driver is told either way.',
          requestData: {
            requestId: req.id,
            driverId: req.driver_id,
            notes: req.description || '',
            startDate: req.start_date,
            endDate: req.end_date,
          },
        });
      });

      // Open loads that are late or have nobody to haul them. The same rules the dashboard counts use.
      const todayStr = format(now, 'yyyy-MM-dd');
      const { data: openLoads } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, status, driver_id, origin, destination, pickup_date, delivery_date')
        .is('deleted_at', null)
        .in('status', [...OPEN_STATUSES]);
      const lane = (l: any) => `${cityState(l.origin) || l.origin} to ${cityState(l.destination) || l.destination}`;
      openLoads?.forEach((load) => {
        const ref = load.landstar_load_id || `#${String(load.id).slice(0, 8)}`;
        if (isPastDue(load, todayStr)) {
          alertsList.push({
            id: `late-${load.id}`,
            type: 'past_due',
            priority: 'high',
            title: `Load ${ref} is past due`,
            description: `${lane(load)}. Delivery was ${format(new Date(`${load.delivery_date}T00:00:00`), 'MMM d')} and it is still ${String(load.status).replace(/_/g, ' ')}.`,
            link: `/fleet-loads?highlight=${load.id}`,
            next: 'Open the load. If it was delivered, mark it delivered; if not, fix the delivery date.',
          });
        } else if (!load.driver_id && load.pickup_date && load.pickup_date <= format(addDays(now, 2), 'yyyy-MM-dd')) {
          alertsList.push({
            id: `nodriver-${load.id}`,
            type: 'no_driver',
            priority: 'high',
            title: `Load ${ref} has no driver`,
            description: `${lane(load)}. Picks up ${format(new Date(`${load.pickup_date}T00:00:00`), 'EEE, MMM d')}.`,
            link: `/fleet-loads?highlight=${load.id}`,
            next: 'Open the load, or assign a driver from the Schedule tab.',
          });
        }
      });


      // Fetch drivers with expiring credentials
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, license_expiry, medical_card_expiry, hazmat_expiry')
        .is('deleted_at', null)
        .eq('status', 'active');

      drivers?.forEach(driver => {
        if (driver.license_expiry && isBefore(new Date(driver.license_expiry), in30Days)) {
          alertsList.push({
            id: `cred-license-${driver.id}`,
            type: 'credential',
            priority: isBefore(new Date(driver.license_expiry), in14Days) ? 'high' : 'medium',
            title: `${isBefore(new Date(driver.license_expiry), now) ? 'License expired' : 'License expiring'}: ${driver.first_name} ${driver.last_name}`,
            description: `${isBefore(new Date(driver.license_expiry), now) ? 'Expired' : 'Expires'} ${format(new Date(driver.license_expiry), 'MMM d, yyyy')}`,
            link: '/drivers',
            next: 'Get the renewed license from the driver, then update it on the Drivers page.',
          });
        }
        if (driver.medical_card_expiry && isBefore(new Date(driver.medical_card_expiry), in30Days)) {
          alertsList.push({
            id: `cred-medical-${driver.id}`,
            type: 'credential',
            priority: isBefore(new Date(driver.medical_card_expiry), in14Days) ? 'high' : 'medium',
            title: `${isBefore(new Date(driver.medical_card_expiry), now) ? 'Medical card expired' : 'Medical card expiring'}: ${driver.first_name} ${driver.last_name}`,
            description: `${isBefore(new Date(driver.medical_card_expiry), now) ? 'Expired' : 'Expires'} ${format(new Date(driver.medical_card_expiry), 'MMM d, yyyy')}`,
            link: '/drivers',
            next: 'Get the new medical card from the driver, then update it on the Drivers page.',
          });
        }
      });

      // Fetch inspection schedules from service_schedules (source of truth)
      const { data: inspectionSchedules } = await supabase
        .from('service_schedules')
        .select('id, truck_id, last_performed_date, interval_days, trucks!inner(unit_number, status)')
        .eq('service_name', '120-Day Inspection')
        .is('trucks.deleted_at', null)
        .eq('trucks.status', 'active')
        .not('last_performed_date', 'is', null);

      inspectionSchedules?.forEach(schedule => {
        const lastPerformed = new Date(schedule.last_performed_date + 'T00:00:00');
        const nextDue = addDays(lastPerformed, schedule.interval_days);
        if (isBefore(nextDue, in14Days)) {
          const truck = schedule.trucks as any;
          alertsList.push({
            id: `insp-${schedule.truck_id}`,
            type: 'inspection',
            priority: isBefore(nextDue, now) ? 'high' : 'medium',
            title: `${isBefore(nextDue, now) ? 'Inspection overdue' : 'Inspection due'}: unit ${truck.unit_number}`,
            description: `${isBefore(nextDue, now) ? 'Was due' : 'Due'} ${format(nextDue, 'MMM d, yyyy')}`,
            link: '/trucks',
            next: 'Book the 120-day inspection, then record it on the Trucks page.',
          });
        }
      });

      // Detention timer: any load currently in an arrival status whose elapsed time
      // since the most recent arrival-status change exceeds the trailer-type free time.
      const { data: activeArrivals } = await supabase
        .from('fleet_loads')
        .select(`
          id, status, origin, destination, trailer_id,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name)
        `)
        .is('deleted_at', null)
        .in('status', ARRIVAL_STATUSES as unknown as string[]);

      const [{ data: detentionRules }, { data: trailerRows }] = await Promise.all([
        supabase.from('detention_rules').select('trailer_type, free_time_minutes, hourly_rate'),
        activeArrivals && activeArrivals.length > 0
          ? supabase
              .from('trailers')
              .select('id, trailer_type, unit_number')
              .in('id', activeArrivals.map((l: any) => l.trailer_id).filter(Boolean))
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const ruleByType = new Map<string, { free_time_minutes: number; hourly_rate: number }>(
        (detentionRules ?? []).map((r: any) => [r.trailer_type, r])
      );
      const trailerById = new Map<string, { trailer_type: string; unit_number: string }>(
        (trailerRows ?? []).map((t: any) => [t.id, t])
      );

      if (activeArrivals && activeArrivals.length > 0) {
        const loadIds = activeArrivals.map((l: any) => l.id);
        const { data: latestLogs } = await supabase
          .from('load_status_logs')
          .select('load_id, new_status, created_at')
          .in('load_id', loadIds)
          .in('new_status', ARRIVAL_STATUSES as unknown as string[])
          .order('created_at', { ascending: false });

        const startedAt = new Map<string, Date>();
        latestLogs?.forEach((log: any) => {
          if (!startedAt.has(log.load_id)) {
            startedAt.set(log.load_id, new Date(log.created_at));
          }
        });

        activeArrivals.forEach((load: any) => {
          const start = startedAt.get(load.id);
          if (!start) return;
          const trailerType = load.trailer_id ? trailerById.get(load.trailer_id)?.trailer_type : undefined;
          const rule = trailerType ? ruleByType.get(trailerType) : undefined;
          if (!rule || rule.free_time_minutes <= 0) return;

          const elapsedMin = (now.getTime() - start.getTime()) / 60000;
          if (elapsedMin <= rule.free_time_minutes) return;

          const overMin = Math.floor(elapsedMin - rule.free_time_minutes);
          const overHrs = (overMin / 60).toFixed(1);
          const driver = load.driver as any;
          const driverName = `${driver?.first_name || ''} ${driver?.last_name || ''}`.trim() || 'Unassigned';
          const route = `${(load.origin || '').split(',')[0]} → ${(load.destination || '').split(',')[0]}`;
          alertsList.push({
            id: `detention-${load.id}`,
            type: 'detention_timer',
            priority: 'high',
            title: `Detention accruing — ${driverName}`,
            description: `${route} • ${overHrs}h past ${rule.free_time_minutes}m free time (${trailerType})`,
            link: `/fleet-loads?highlight=${load.id}`,
            next: 'Add the detention charge to the load before the driver leaves.',
          });
        });
      }




      // Sort: driver requests first, then by priority
      return alertsList.sort((a, b) => {
        if (a.type === 'driver_request' && b.type !== 'driver_request') return -1;
        if (b.type === 'driver_request' && a.type !== 'driver_request') return 1;
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }).slice(0, 25);
    },
  });

  const respondToRequest = useMutation({
    mutationFn: async ({ requestId, driverId, action, notes }: { requestId: string; driverId: string; action: 'approve' | 'deny'; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: updateError } = await supabase
        .from('driver_requests')
        .update({
          status: action === 'approve' ? 'approved' : 'denied',
          response_notes: notes,
          responded_by: user?.id,
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      const { error: notifyError } = await supabase
        .from('driver_notifications')
        .insert({
          driver_id: driverId,
          title: action === 'approve' ? 'Request Approved' : 'Request Denied',
          message: action === 'approve' 
            ? `Your request has been approved.${notes ? `\n\nDispatcher notes: ${notes}` : ''}`
            : `Your request was denied.${notes ? `\n\nReason: ${notes}` : ''}`,
          notification_type: 'request_response',
          related_id: requestId,
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
      console.error('Error responding to request:', error);
      toast({
        title: 'Error',
        description: 'Failed to process the request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleRequestAction = (alert: Alert, action: 'approve' | 'deny') => {
    setResponseDialog({ open: true, alert, action });
  };

  const handleSubmitResponse = () => {
    if (!responseDialog.alert?.requestData) return;
    
    respondToRequest.mutate({
      requestId: responseDialog.alert.requestData.requestId,
      driverId: responseDialog.alert.requestData.driverId,
      action: responseDialog.action,
      notes: responseNotes,
    });
  };

  const getAlertIcon = (alert: Alert) => {
    if (alert.type === 'driver_request') {
      switch (alert.requestType) {
        case 'detention': return Clock;
        case 'home_time': return Home;
        case 'pto': return CalendarDays;
        case 'maintenance': return Wrench;
        default: return Clock;
      }
    }
    switch (alert.type) {
      case 'defect': return FileWarning;
      case 'maintenance': return Wrench;
      case 'credential': return User;
      case 'inspection': return Truck;
      case 'detention_timer': return Clock;
      case 'past_due': return PackageX;
      case 'no_driver': return UserX;
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

  const highPriorityCount = alerts?.filter(a => a.priority === 'high' && a.type !== 'driver_request').length || 0;
  const requestCount = alerts?.filter(a => a.type === 'driver_request').length || 0;
  const groups: Array<{ key: string; title: string; hint: string; items: Alert[] }> = [
    { key: 'requests', title: 'Waiting on you', hint: 'Drivers asked for these.', items: (alerts ?? []).filter((a) => a.type === 'driver_request') },
    { key: 'urgent', title: 'Urgent', hint: 'Act on these today.', items: (alerts ?? []).filter((a) => a.type !== 'driver_request' && a.priority === 'high') },
    { key: 'soon', title: 'Coming up', hint: 'Not urgent yet.', items: (alerts ?? []).filter((a) => a.type !== 'driver_request' && a.priority !== 'high') },
  ].filter((g) => g.items.length > 0);

  const description = isLoading
    ? 'Checking…'
    : (alerts?.length ?? 0) === 0
      ? 'Nothing needs you right now.'
      : [requestCount > 0 ? `${requestCount} ${requestCount === 1 ? 'request' : 'requests'} to answer` : null, highPriorityCount > 0 ? `${highPriorityCount} urgent` : null, `${alerts!.length} in all`].filter(Boolean).join(', ');

  return (
    <>
      <Panel title="Needs attention" description={description} flush className="h-full">
        {isLoading ? (
          <div className="space-y-3 border-t p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : groups.length === 0 ? (
          <div className="border-t px-4 py-10 text-center text-sm text-muted-foreground">
            <Shield className="mx-auto mb-2 h-8 w-8 opacity-50" />
            All clear. Driver requests, late loads, expiring paperwork and detention show up here.
          </div>
        ) : (
          <div className="max-h-[560px] overflow-y-auto">
            {groups.map((group) => (
              <section key={group.key} className="border-t">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pt-3">
                  <h4 className={`font-condensed text-lg font-bold ${group.key === 'urgent' ? 'text-destructive' : ''}`}>
                    {group.title} <span className="text-muted-foreground">({group.items.length})</span>
                  </h4>
                  <p className="text-[13px] text-muted-foreground">{group.hint}</p>
                </div>
                <ul className="divide-y">
                  {group.items.map((alert) => {
                    const Icon = getAlertIcon(alert);
                    return (
                      <li key={alert.id} className="flex items-start gap-3 px-4 py-3">
                        <div className={`mt-0.5 shrink-0 rounded-md p-1.5 ${getPriorityColor(alert.priority)}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium leading-snug">{alert.title}</p>
                          <p className="text-[13px] text-muted-foreground">{alert.description}</p>
                          <p className="text-[13px] text-foreground/80"><span className="font-medium">Next:</span> {alert.next}</p>
                          {alert.requestData?.startDate && (
                            <p className="text-[13px] font-medium text-primary">
                              {format(new Date(alert.requestData.startDate + 'T00:00:00'), 'MMM d')}
                              {alert.requestData.endDate ? ` to ${format(new Date(alert.requestData.endDate + 'T00:00:00'), 'MMM d')}` : ''}
                            </p>
                          )}
                          {alert.type === 'driver_request' && alert.requestData && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button className="h-11 gap-1" onClick={() => handleRequestAction(alert, 'approve')}>
                                <Check className="h-4 w-4" /> Approve
                              </Button>
                              <Button variant="outline" className="h-11 gap-1" onClick={() => handleRequestAction(alert, 'deny')}>
                                <X className="h-4 w-4" /> Deny
                              </Button>
                            </div>
                          )}
                        </div>
                        {alert.type !== 'driver_request' && (
                          <Button variant="outline" className="h-11 shrink-0" onClick={() => navigate(alert.link)}>
                            Open
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>

      {/* Response Dialog */}
      <Dialog open={responseDialog.open} onOpenChange={(open) => setResponseDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {responseDialog.action === 'approve' ? 'Approve Request' : 'Deny Request'}
            </DialogTitle>
            <DialogDescription>
              {responseDialog.alert?.requestData?.notes && (
                <span className="block mt-2 p-2 bg-muted rounded text-sm">
                  <strong>Driver's notes:</strong> {responseDialog.alert.requestData.notes}
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
              disabled={respondToRequest.isPending}
              variant={responseDialog.action === 'deny' ? 'destructive' : 'default'}
            >
              {respondToRequest.isPending ? 'Processing...' : responseDialog.action === 'approve' ? 'Approve' : 'Deny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
