import { useState, lazy, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MapPin, Clock, Truck, Package, CheckCircle, Loader2, FileText, Calendar, DollarSign, Route, Link2, ChevronDown, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { TimeTypeBadge } from '@/components/shared/TimeTypeBadge';
import { StopTime } from '@/components/shared/StopTime';
const LoadRouteMap = lazy(() => import('./LoadRouteMap').then(m => ({ default: m.LoadRouteMap })));
import { MapSkeleton } from '@/components/shared/LazyFallbacks';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ProofOfDeliveryDialog } from './ProofOfDeliveryDialog';
import { IntermediateStopsTimeline } from './IntermediateStopsTimeline';
import { StartingOdometerDialog } from './StartingOdometerDialog';
import { EndingOdometerDialog } from './EndingOdometerDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useOptimisticLoadStatus } from '@/hooks/useOptimisticLoadStatus';
import { getRelativeTimestamp } from './RelativeTimestamp';
import { calculateLoadPay, sumAccessorials } from '@/utils/payCalculations';
import { usePaySettings } from '@/hooks/usePaySettings';


// Helper to format and clean special instructions for better readability
function formatSpecialInstructions(notes: string | null): React.ReactNode {
  if (!notes) return null;
  
  const updatedFromRCMatch = notes.split(/---\s*Updated from Rate Confirmation\s*---/i);
  const mainContent = updatedFromRCMatch[0]?.trim() || '';
  
  const stopsMatch = mainContent.match(/===\s*INTERMEDIATE STOPS\s*===\n?([\s\S]*?)$/i);
  const intermediateStops = stopsMatch?.[1]?.trim();
  
  const mainInstructions = stopsMatch 
    ? mainContent.replace(/===\s*INTERMEDIATE STOPS\s*===[\s\S]*$/i, '').trim()
    : mainContent;
  
  return (
    <div className="space-y-2">
      {mainInstructions && (
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{mainInstructions}</p>
      )}
      {intermediateStops && (
        <div className="border-t border-warning/30 pt-2 mt-2">
          <p className="text-xs font-semibold text-warning mb-1">📍 Intermediate Stops</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{intermediateStops}</p>
        </div>
      )}
    </div>
  );
}

interface Load {
  id: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_end_time?: string | null;
  pickup_time_type: string | null;
  pickup_at?: string | null;
  pickup_tz?: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  delivery_end_time?: string | null;
  delivery_time_type: string | null;
  delivery_at?: string | null;
  delivery_tz?: string | null;
  status: string;
  rate: number | null;
  booked_miles: number | null;
  empty_miles?: number | null;
  start_miles?: number | null;
  end_miles?: number | null;
  notes: string | null;
  landstar_load_id: string | null;
  tracking_id?: string | null;
  pod_required?: boolean;
  is_in_bond?: boolean | null;
  cf_7512_number?: string | null;
  pickup_number?: string | null;
  load_accessorials?: Array<{ id?: string; accessorial_type?: string | null; amount?: number | null; notes?: string | null }>;
}

interface ActiveLoadCardProps {
  load: Load | undefined;
  payRate: number | null;
  payType: string | null;
  driverId?: string;
  onStatusUpdate?: () => void;
}

// Status progression order
const STATUS_PROGRESSION: Record<string, string> = {
  'pending': 'assigned',
  'assigned': 'loading',
  'loading': 'in_transit',
  'in_transit': 'delivered',
};

function getProgressButtonLabel(currentStatus: string): string {
  switch (currentStatus) {
    case 'pending': return 'Accept Load';
    case 'assigned': return 'Arrived at Pickup';
    case 'loading': return 'Loaded & Departing';
    case 'in_transit': return 'Mark Delivered';
    default: return 'Update Status';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'bg-amber-500';
    case 'assigned': return 'bg-blue-500';
    case 'loading': return 'bg-purple-500';
    case 'in_transit': return 'bg-emerald-500';
    case 'delivered': return 'bg-success';
    case 'cancelled': return 'bg-destructive';
    default: return 'bg-muted';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'assigned': return 'Assigned';
    case 'loading': return 'Loading';
    case 'in_transit': return 'In Transit';
    case 'delivered': return 'Delivered';
    default: return status.replace('_', ' ');
  }
}

function getCondensedAddress(address: string): string {
  if (!address) return '-';
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  
  for (let i = parts.length - 1; i >= 0; i--) {
    const match = parts[i].match(/\b([A-Z]{2})\b/);
    if (match) {
      const state = match[1];
      const city = i > 0 ? parts[i - 1] : '';
      return city ? `${city}, ${state}` : state;
    }
  }
  
  return parts[0] || address;
}

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return format(parseISO(date), 'MMM d, yyyy');
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export function ActiveLoadCard({ load, payRate, payType, driverId, onStatusUpdate }: ActiveLoadCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [podDialogOpen, setPodDialogOpen] = useState(false);
  const [startOdometerOpen, setStartOdometerOpen] = useState(false);
  const [endOdometerOpen, setEndOdometerOpen] = useState(false);
  const [accessorialsOpen, setAccessorialsOpen] = useState(false);
  const { isOnline, enqueue } = useOfflineQueue();
  const { applyOptimistic } = useOptimisticLoadStatus();
  // Single source of truth for pay math. Must be called before any early return.
  const paySettings = usePaySettings();

  if (!load) {
    return (
      <Card className="border-2 border-dashed border-muted">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No Active Load</h3>
          <p className="text-muted-foreground text-sm">
            Check with dispatch for your next assignment
          </p>
        </CardContent>
      </Card>
    );
  }

  const canProgress = STATUS_PROGRESSION[load.status] !== undefined;
  const nextStatus = STATUS_PROGRESSION[load.status];

  const payBreakdown = calculateLoadPay(load, { pay_type: payType, pay_rate: payRate }, paySettings);
  const estimatedPay = payBreakdown.total;

  const handleProgressStatus = async () => {
    if (!nextStatus) return;

    // Intercept: starting a load — capture odometer first.
    if (nextStatus === 'in_transit') {
      setStartOdometerOpen(true);
      return;
    }

    // Intercept: completing a load — capture ending odometer (with POD if required).
    if (nextStatus === 'delivered') {
      if (load.pod_required !== false) {
        setPodDialogOpen(true);
      } else {
        setEndOdometerOpen(true);
      }
      return;
    }

    if (!isOnline) {
      enqueue('load_status_update', { id: load.id, status: nextStatus });
      toast.success(`Status update saved. Will sync when online.`);
      onStatusUpdate?.();
      return;
    }

    // Optimistic: update cache immediately, then attempt the network write.
    const { commit, rollback } = applyOptimistic(load.id, { status: nextStatus });
    onStatusUpdate?.();

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ status: nextStatus })
        .eq('id', load.id);

      if (error) throw error;

      toast.success(`Load status updated to ${getStatusLabel(nextStatus)}`);
      commit();
    } catch (error) {
      console.error('Error updating status:', error);
      rollback();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden border-2 border-primary/50 shadow-lg">
        {/* In-Bond / Rule 480 compliance banner */}
        {load.is_in_bond && (
          <div className="bg-destructive text-destructive-foreground px-4 py-3 border-b border-destructive/40 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm tracking-wide uppercase">In-Bond Shipment — Do Not Break Seal</div>
              {load.cf_7512_number && (
                <div className="text-xs opacity-90 font-mono mt-0.5 truncate">CF 7512: {load.cf_7512_number}</div>
              )}
            </div>
          </div>
        )}
        {/* Status bar */}
        <div className={`h-2 ${getStatusColor(load.status)}`} />
        
        <CardContent className="p-4 space-y-3">
          {/* Load ID and Status */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-medium">
              Load #{load.landstar_load_id || 'N/A'}
            </span>
            <Badge variant="outline" className="text-xs">
              {getStatusLabel(load.status)}
            </Badge>
          </div>

          {/* Route */}
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium">{getCondensedAddress(load.origin)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium">{getCondensedAddress(load.destination)}</span>
          </div>

          {/* Pickup Number - prominent guard-shack badge */}
          {load.pickup_number && (
            <div className="inline-flex items-center gap-2 rounded-md border-2 border-warning bg-warning/15 px-3 py-1.5 text-warning font-bold tracking-wide shadow-sm">
              <FileText className="h-4 w-4" />
              <span className="text-sm uppercase">Pickup #:</span>
              <span className="font-mono text-base">{load.pickup_number}</span>
            </div>
          )}

          {/* Date & Time */}
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0" />
              {load.status === 'delivered' ? (
                <span className="text-success font-medium">
                  {getRelativeTimestamp(load.delivery_date, null)}
                </span>
              ) : load.status === 'in_transit' ? (
                <span className="inline-flex items-center gap-1">
                  Delivery:{' '}
                  <StopTime
                    utcIso={load.delivery_at}
                    tz={load.delivery_tz}
                    legacyDate={load.delivery_date}
                    legacyTime={load.delivery_time}
                    legacyEndTime={load.delivery_end_time}
                    withDate
                  />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  Pickup:{' '}
                  <StopTime
                    utcIso={load.pickup_at}
                    tz={load.pickup_tz}
                    legacyDate={load.pickup_date}
                    legacyTime={load.pickup_time}
                    legacyEndTime={load.pickup_end_time}
                    withDate
                  />
                </span>
              )}
            </div>
            {load.status !== 'delivered' && (
              <div className="pl-6">
                {load.status === 'in_transit' ? (
                  load.delivery_time && <TimeTypeBadge timeType={load.delivery_time_type} time={load.delivery_time} endTime={load.delivery_end_time} variant="driver" />
                ) : (
                  load.pickup_time && <TimeTypeBadge timeType={load.pickup_time_type} time={load.pickup_time} endTime={load.pickup_end_time} variant="driver" />
                )}
              </div>
            )}
          </div>

          {/* Route Map Preview — isolated so mixed-content / WebSocket failures
              on mobile can't take down the rest of the Active Load card. */}
          <ErrorBoundary
            compact
            fallback={
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Map unavailable on this connection.
              </div>
            }
          >
            <Suspense fallback={<MapSkeleton height={200} />}>
              <LoadRouteMap origin={load.origin} destination={load.destination} notes={load.notes} loadId={load.id} />
            </Suspense>
          </ErrorBoundary>

          {/* Miles and Estimated Pay */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Route className="h-4 w-4 text-muted-foreground" />
              <span>{load.booked_miles?.toLocaleString() || 0} mi</span>
            </div>
            {payBreakdown.payType === 'flat' ? (
              payBreakdown.accessorialsTotal > 0 ? (
                <div className="flex items-center gap-2 text-sm font-medium text-success">
                  <DollarSign className="h-4 w-4" />
                  <span>Accessorial: {formatCurrency(payBreakdown.accessorialsTotal)}</span>
                </div>
              ) : null
            ) : (
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <DollarSign className="h-4 w-4" />
                <span>Est. {formatCurrency(estimatedPay)}</span>
              </div>
            )}
          </div>


          {/* Intermediate stops timeline (structured) */}
          <IntermediateStopsTimeline loadId={load.id} />

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">

            {load.tracking_id && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={async () => {
                  const url = `${window.location.origin}/track?tracking_id=${load.tracking_id}`;
                  await navigator.clipboard.writeText(url);
                  toast.success('Tracking link copied!');
                }}
              >
                <Link2 className="h-4 w-4" />
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => setDetailsOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              Load Details
            </Button>
            {canProgress && (
              <Button 
                size="sm" 
                className="flex-1"
                onClick={handleProgressStatus}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    {getProgressButtonLabel(load.status)}
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Delivered indicator */}
          {load.status === 'delivered' && (
            <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-center">
              <CheckCircle className="h-5 w-5 text-success mx-auto mb-1" />
              <p className="text-sm font-medium text-success">Load Delivered</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* POD Dialog */}
      {load && driverId && (
        <ProofOfDeliveryDialog
          open={podDialogOpen}
          onOpenChange={setPodDialogOpen}
          loadId={load.id}
          loadNumber={load.landstar_load_id}
          destination={load.destination}
          driverId={driverId}
          startMiles={load.start_miles ?? null}
          onComplete={() => onStatusUpdate?.()}
        />
      )}

      {/* Starting Odometer Intercept */}
      <StartingOdometerDialog
        open={startOdometerOpen}
        onOpenChange={setStartOdometerOpen}
        loadId={load.id}
        loadNumber={load.landstar_load_id}
        nextStatus="in_transit"
        onComplete={() => onStatusUpdate?.()}
      />

      {/* Ending Odometer Intercept (no-POD path) */}
      <EndingOdometerDialog
        open={endOdometerOpen}
        onOpenChange={setEndOdometerOpen}
        loadId={load.id}
        loadNumber={load.landstar_load_id}
        startMiles={load.start_miles ?? null}
        driverId={driverId ?? (load as any).driver_id ?? null}
        nextStatus="delivered"
        onComplete={() => onStatusUpdate?.()}
      />


      {/* Load Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Load #{load.landstar_load_id || 'N/A'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={`${getStatusColor(load.status)} text-white`}>
                {getStatusLabel(load.status)}
              </Badge>
            </div>

            {/* Origin */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-success" />
                Origin
              </div>
              <p className="font-medium pl-6">{load.origin}</p>
              {load.pickup_number && (
                <div className="pl-6 mt-2">
                  <div className="inline-flex items-center gap-2 rounded-md border-2 border-warning bg-warning/15 px-3 py-1.5 text-warning font-bold tracking-wide shadow-sm">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm uppercase">Pickup #:</span>
                    <span className="font-mono text-base">{load.pickup_number}</span>
                  </div>
                </div>
              )}
              {(load.pickup_at || load.pickup_date) && (
                <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1 flex-wrap">
                  <Calendar className="h-3 w-3" />
                  Pickup:{' '}
                  <StopTime
                    utcIso={load.pickup_at}
                    tz={load.pickup_tz}
                    legacyDate={load.pickup_date}
                    legacyTime={load.pickup_time}
                    withDate
                    className="font-medium text-foreground"
                  />
                </p>
              )}
            </div>

            {/* Destination */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-destructive" />
                Destination
              </div>
              <p className="font-medium pl-6">{load.destination}</p>
              {(load.delivery_at || load.delivery_date) && (
                <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1 flex-wrap">
                  <Calendar className="h-3 w-3" />
                  Delivery:{' '}
                  <StopTime
                    utcIso={load.delivery_at}
                    tz={load.delivery_tz}
                    legacyDate={load.delivery_date}
                    legacyTime={load.delivery_time}
                    withDate
                    className="font-medium text-foreground"
                  />
                </p>
              )}
            </div>

            {/* Miles */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Booked Miles</span>
              </div>
              <span className="font-semibold">{load.booked_miles?.toLocaleString() || 'TBD'}</span>
            </div>

            {/* Estimated Pay / Accessorials (flat-rate) */}
            {payBreakdown.payType === 'flat' ? (
              payBreakdown.accessorialsTotal > 0 && (
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Accessorials</span>
                  </div>
                  <span className="font-bold text-primary text-lg">
                    {formatCurrency(payBreakdown.accessorialsTotal)}
                  </span>
                </div>
              )
            ) : (
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Estimated Pay</span>
                </div>
                <span className="font-bold text-primary text-lg">
                  {formatCurrency(estimatedPay)}
                </span>
              </div>
            )}


            {/* Accessorials Breakdown */}
            {(load.load_accessorials?.length ?? 0) > 0 && (
              <Collapsible open={accessorialsOpen} onOpenChange={setAccessorialsOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Accessorials</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {formatCurrency(sumAccessorials(load))}
                    </Badge>
                    <ChevronDown className={`h-4 w-4 transition-transform ${accessorialsOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                    {load.load_accessorials!.map((a, idx) => (
                      <div key={a.id ?? idx} className="flex items-start justify-between text-sm py-1 gap-3">
                        <div className="min-w-0">
                          <p className="capitalize font-medium">
                            {(a.accessorial_type || 'Other').replace(/_/g, ' ')}
                          </p>
                          {a.notes && (
                            <p className="text-xs text-muted-foreground">{a.notes}</p>
                          )}
                        </div>
                        <span className="font-medium tabular-nums shrink-0">
                          {formatCurrency(Number(a.amount ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Special Instructions */}
            {load.notes && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <p className="text-xs text-warning font-medium uppercase tracking-wide mb-2">
                  Special Instructions
                </p>
                <div className="max-h-40 overflow-y-auto pr-3">
                    {formatSpecialInstructions(load.notes)}
                </div>
                <p className="text-[10px] text-warning/60 mt-1 italic">Scroll for more ↓</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
