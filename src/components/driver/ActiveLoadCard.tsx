import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, Clock, Truck, Navigation, Package, CheckCircle, Loader2, FileText, Calendar, DollarSign, Route } from 'lucide-react';
import { format, differenceInHours, differenceInMinutes, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Load {
  id: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  pickup_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  status: string;
  rate: number | null;
  booked_miles: number | null;
  notes: string | null;
  landstar_load_id: string | null;
  load_accessorials?: { amount: number }[];
}

interface ActiveLoadCardProps {
  load: Load | undefined;
  payRate: number | null;
  payType: string | null;
  onStatusUpdate?: () => void;
}

// Status progression order (full workflow)
const STATUS_PROGRESSION = ['pending', 'assigned', 'loading', 'in_transit', 'delivered'] as const;

function getNextStatus(currentStatus: string): string | null {
  const currentIndex = STATUS_PROGRESSION.indexOf(currentStatus as typeof STATUS_PROGRESSION[number]);
  if (currentIndex === -1 || currentIndex >= STATUS_PROGRESSION.length - 1) {
    return null; // Already delivered or unknown status
  }
  return STATUS_PROGRESSION[currentIndex + 1];
}

function getProgressButtonLabel(currentStatus: string): string {
  switch (currentStatus) {
    case 'pending':
      return 'Accept Load';
    case 'assigned':
      return 'Arrived at Pickup';
    case 'loading':
      return 'Loaded & Departing';
    case 'in_transit':
      return 'Mark Delivered';
    default:
      return 'Update Status';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'delivered':
      return 'bg-success text-success-foreground';
    case 'in_transit':
      return 'bg-primary text-primary-foreground';
    case 'loading':
      return 'bg-warning text-warning-foreground';
    case 'assigned':
    case 'pending':
      return 'bg-secondary text-secondary-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function getTimeStatus(dateStr: string | null): { color: string; label: string } {
  if (!dateStr) return { color: 'text-muted-foreground', label: 'TBD' };
  
  const date = parseISO(dateStr);
  const now = new Date();
  const hoursUntil = differenceInHours(date, now);
  const minutesUntil = differenceInMinutes(date, now);

  if (minutesUntil < 0) {
    return { color: 'text-destructive', label: 'OVERDUE' };
  } else if (hoursUntil < 2) {
    return { color: 'text-warning', label: `${minutesUntil}m` };
  } else if (hoursUntil < 6) {
    return { color: 'text-warning', label: `${hoursUntil}h` };
  }
  return { color: 'text-success', label: `${hoursUntil}h` };
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'in_transit':
      return 'En Route to Delivery';
    case 'loading':
      return 'At Pickup / Loading';
    case 'assigned':
      return 'En Route to Pickup';
    case 'pending':
      return 'Awaiting Assignment';
    case 'delivered':
      return 'Delivered';
    default:
      return status.replace('_', ' ').toUpperCase();
  }
}

function getCondensedAddress(address: string): { full: string; short: string } {
  const full = address;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);

  // Find a "ST 12345"-like part for state/zip
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/\b([A-Z]{2})\b/);
    if (m) {
      const state = m[1];
      // city is usually the part right before the state/zip chunk
      const city = i > 0 ? parts[i - 1] : '';
      const short = city ? `${city}, ${state}` : state;
      return { full, short };
    }
  }

  // Fallback: use first part (often street or facility)
  return { full, short: parts[0] || address };
}

export function ActiveLoadCard({ load, payRate, payType, onStatusUpdate }: ActiveLoadCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  const isEnRouteToDelivery = load.status === 'in_transit';
  const targetDate = isEnRouteToDelivery ? load.delivery_date : load.pickup_date;
  const targetLocation = isEnRouteToDelivery ? load.destination : load.origin;
  const timeStatus = getTimeStatus(targetDate);
  const nextStatus = getNextStatus(load.status);
  const isDelivered = load.status === 'delivered';

  // Calculate estimated pay
  const accessorialsTotal = load.load_accessorials?.reduce((sum, a) => sum + (a.amount || 0), 0) || 0;
  let estimatedPay = 0;
  if (payType === 'percentage' && load.rate && payRate) {
    estimatedPay = ((load.rate + accessorialsTotal) * (payRate / 100));
  } else if (payType === 'per_mile' && load.booked_miles && payRate) {
    estimatedPay = load.booked_miles * payRate;
  }

  const handleNavigate = () => {
    const encodedAddress = encodeURIComponent(targetLocation);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
  };

  const handleProgressStatus = async () => {
    if (!nextStatus) return;
    
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ status: nextStatus })
        .eq('id', load.id);

      if (error) throw error;

      toast.success(`Load status updated to ${nextStatus.replace('_', ' ')}`);
      onStatusUpdate?.();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update load status');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="border-2 border-primary/50 shadow-lg">
      {/* Status Bar */}
      <div className={`h-2 rounded-t-lg ${getStatusColor(load.status).split(' ')[0]}`} />
      
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {getStatusLabel(load.status)}
          </CardTitle>
          <Badge variant="outline" className="font-mono">
            {load.landstar_load_id || 'No ID'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Target Location */}
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                {isEnRouteToDelivery ? 'Delivering To' : 'Picking Up At'}
              </p>
              {(() => {
                const addr = getCondensedAddress(targetLocation);
                return (
                  <p className="font-semibold text-lg leading-tight min-w-0">
                    <span className="hidden md:block" title={addr.full}>{addr.full}</span>
                    <span className="md:hidden block truncate" title={addr.full}>{addr.short}</span>
                  </p>
                );
              })()}
            </div>
            <Button 
              size="sm" 
              onClick={handleNavigate}
              className="shrink-0"
            >
              <Navigation className="h-4 w-4 mr-1" />
              Navigate
            </Button>
          </div>
          
          {/* Appointment Time */}
          {targetDate && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Appointment: {format(parseISO(targetDate), 'MMM d, h:mm a')}
              </span>
              <Badge variant="secondary" className={`ml-auto ${timeStatus.color}`}>
                {timeStatus.label}
              </Badge>
            </div>
          )}
        </div>

        {/* Route Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-success shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Origin</p>
              {(() => {
                const addr = getCondensedAddress(load.origin);
                return (
                  <p className="font-medium min-w-0">
                    <span className="hidden md:block truncate" title={addr.full}>{addr.full}</span>
                    <span className="md:hidden block truncate" title={addr.full}>{addr.short}</span>
                  </p>
                );
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Destination</p>
              {(() => {
                const addr = getCondensedAddress(load.destination);
                return (
                  <p className="font-medium min-w-0">
                    <span className="hidden md:block truncate" title={addr.full}>{addr.full}</span>
                    <span className="md:hidden block truncate" title={addr.full}>{addr.short}</span>
                  </p>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Load Details Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setDetailsOpen(true)}
        >
          <FileText className="h-4 w-4 mr-2" />
          Load Details
        </Button>

        {/* Miles & Estimated Pay */}
        <div className="flex items-center justify-between bg-primary/10 rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Miles</p>
            <p className="font-semibold">{load.booked_miles?.toLocaleString() || 'TBD'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Est. Pay</p>
            <p className="font-semibold text-primary text-lg">
              ${estimatedPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Special Instructions */}
        {load.notes && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <p className="text-xs text-warning font-medium uppercase tracking-wide mb-1">
              Special Instructions
            </p>
            <p className="text-sm">{load.notes}</p>
          </div>
        )}

        {/* Status Progression Button */}
        {!isDelivered && nextStatus && (
          <Button
            onClick={handleProgressStatus}
            disabled={isUpdating}
            className="w-full bg-primary hover:bg-primary/90"
            size="lg"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                {getProgressButtonLabel(load.status)}
              </>
            )}
          </Button>
        )}

        {isDelivered && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-center">
            <CheckCircle className="h-5 w-5 text-success mx-auto mb-1" />
            <p className="text-sm font-medium text-success">Load Delivered</p>
          </div>
        )}
      </CardContent>

      {/* Load Details Dialog (Read-Only) */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Load Details
              <Badge variant="outline" className="font-mono ml-2">
                {load.landstar_load_id || 'No ID'}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={getStatusColor(load.status)}>
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
              {load.pickup_date && (
                <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Pickup: {format(parseISO(load.pickup_date), 'EEE, MMM d, yyyy')}
                  {load.pickup_time && <span className="font-medium text-foreground ml-1">@ {load.pickup_time}</span>}
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
              {load.delivery_date && (
                <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Delivery: {format(parseISO(load.delivery_date), 'EEE, MMM d, yyyy')}
                  {load.delivery_time && <span className="font-medium text-foreground ml-1">@ {load.delivery_time}</span>}
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

            {/* Estimated Pay */}
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Estimated Pay</span>
              </div>
              <span className="font-bold text-primary text-lg">
                ${estimatedPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Special Instructions */}
            {load.notes && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <p className="text-xs text-warning font-medium uppercase tracking-wide mb-1">
                  Special Instructions
                </p>
                <p className="text-sm whitespace-pre-wrap">{load.notes}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
