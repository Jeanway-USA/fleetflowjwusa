import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Clock, Truck, Package, CheckCircle, Loader2, FileText, Calendar, DollarSign, Route } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { LoadRouteMap } from './LoadRouteMap';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getRelativeTimestamp } from './RelativeTimestamp';

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
  delivery_date: string | null;
  delivery_time: string | null;
  status: string;
  rate: number | null;
  booked_miles: number | null;
  empty_miles?: number | null;
  notes: string | null;
  landstar_load_id: string | null;
  load_accessorials?: { amount: number }[];
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

  // Calculate estimated pay
  const accessorialsTotal = load.load_accessorials?.reduce((sum, a) => sum + (a.amount || 0), 0) || 0;
  let estimatedPay = 0;
  if (payType === 'percentage' && load.rate && payRate) {
    estimatedPay = ((load.rate + accessorialsTotal) * (payRate / 100));
  } else if (payType === 'per_mile' && load.booked_miles && payRate) {
    estimatedPay = load.booked_miles * payRate;
  }

  const handleProgressStatus = async () => {
    if (!nextStatus) return;
    
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ status: nextStatus })
        .eq('id', load.id);

      if (error) throw error;

      toast.success(`Load status updated to ${getStatusLabel(nextStatus)}`);
      onStatusUpdate?.();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update load status');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden border-2 border-primary/50 shadow-lg">
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

          {/* Date & Time */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            {load.status === 'delivered' ? (
              <span className="text-success font-medium">
                {getRelativeTimestamp(load.delivery_date, null)}
              </span>
            ) : load.status === 'in_transit' ? (
              <span>
                Delivery: {formatDate(load.delivery_date)}
                {load.delivery_time && <span className="ml-1 text-foreground font-medium">@ {load.delivery_time}</span>}
              </span>
            ) : (
              <span>
                Pickup: {formatDate(load.pickup_date)}
                {load.pickup_time && <span className="ml-1 text-foreground font-medium">@ {load.pickup_time}</span>}
              </span>
            )}
          </div>

          {/* Route Map Preview */}
          <LoadRouteMap origin={load.origin} destination={load.destination} />

          {/* Miles and Estimated Pay */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Route className="h-4 w-4 text-muted-foreground" />
              <span>{load.booked_miles?.toLocaleString() || 0} mi</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-success">
              <DollarSign className="h-4 w-4" />
              <span>Est. {formatCurrency(estimatedPay)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
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
                {formatCurrency(estimatedPay)}
              </span>
            </div>

            {/* Special Instructions */}
            {load.notes && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <p className="text-xs text-warning font-medium uppercase tracking-wide mb-2">
                  Special Instructions
                </p>
                <ScrollArea className="max-h-64">
                  <div className="pr-2">
                    {formatSpecialInstructions(load.notes)}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
