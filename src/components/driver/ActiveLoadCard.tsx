import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Truck, Navigation, Package, CheckCircle, Loader2 } from 'lucide-react';
import { format, differenceInHours, differenceInMinutes, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Load {
  id: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  delivery_date: string | null;
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

// Status progression order (matching database constraint: assigned, in_transit, delivered)
const STATUS_PROGRESSION = ['assigned', 'in_transit', 'delivered'] as const;

function getNextStatus(currentStatus: string): string | null {
  const currentIndex = STATUS_PROGRESSION.indexOf(currentStatus as typeof STATUS_PROGRESSION[number]);
  if (currentIndex === -1 || currentIndex >= STATUS_PROGRESSION.length - 1) {
    return null; // Already delivered or unknown status
  }
  return STATUS_PROGRESSION[currentIndex + 1];
}

function getProgressButtonLabel(currentStatus: string): string {
  switch (currentStatus) {
    case 'assigned':
      return 'Depart for Delivery';
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

export function ActiveLoadCard({ load, payRate, payType, onStatusUpdate }: ActiveLoadCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

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
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                {isEnRouteToDelivery ? 'Delivering To' : 'Picking Up At'}
              </p>
              <p className="font-semibold text-lg leading-tight">{targetLocation}</p>
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
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Origin</p>
              <p className="font-medium truncate">{load.origin}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="font-medium truncate">{load.destination}</p>
            </div>
          </div>
        </div>

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
    </Card>
  );
}
