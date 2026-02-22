import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { 
  MapPin, 
  Calendar, 
  Route, 
  DollarSign, 
  FileText,
  CheckCircle,
  Truck,
  Clock,
  Package
} from 'lucide-react';
import { getRelativeTimestamp } from './RelativeTimestamp';

// Status progression for drivers
const STATUS_PROGRESSION: Record<string, string> = {
  'pending': 'assigned',
  'assigned': 'loading',
  'loading': 'in_transit',
  'in_transit': 'delivered',
};

// Get next status button label
const getProgressButtonLabel = (status: string): string => {
  switch (status) {
    case 'pending': return 'Accept Load';
    case 'assigned': return 'Arrived at Pickup';
    case 'loading': return 'Loaded & Departing';
    case 'in_transit': return 'Mark Delivered';
    default: return '';
  }
};

// Get status color classes
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'pending': return 'bg-amber-500';
    case 'assigned': return 'bg-blue-500';
    case 'loading': return 'bg-purple-500';
    case 'in_transit': return 'bg-emerald-500';
    case 'delivered': return 'bg-success';
    case 'cancelled': return 'bg-destructive';
    default: return 'bg-muted';
  }
};

// Get status label
const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending': return 'Pending';
    case 'assigned': return 'Assigned';
    case 'loading': return 'Loading';
    case 'in_transit': return 'In Transit';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

// Condense address to City, State
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

// Format date for display
const formatDate = (date: string | null) => {
  if (!date) return '-';
  return format(parseISO(date), 'MMM d, yyyy');
};

// Format currency
const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

interface Load {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  pickup_date: string | null;
  pickup_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  status: string;
  booked_miles: number | null;
  rate: number | null;
  fuel_surcharge: number | null;
  notes: string | null;
  driver_id: string | null;
}

interface DriverLoadCardProps {
  load: Load;
  payRate: number;
  payType: string;
  onStatusUpdate: () => void;
}

function DriverLoadCard({ load, payRate, payType, onStatusUpdate }: DriverLoadCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const canProgress = STATUS_PROGRESSION[load.status] !== undefined;
  const nextStatus = STATUS_PROGRESSION[load.status];

  // Calculate estimated pay
  const estimatedPay = payType === 'per_mile' 
    ? (load.booked_miles || 0) * payRate
    : ((load.rate || 0) + (load.fuel_surcharge || 0)) * (payRate / 100);

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
      onStatusUpdate();
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
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

          {/* Date & Time - Show relative for delivered, hide time for cancelled */}
          {!['cancelled'].includes(load.status) && (
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
          )}

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
                    <Clock className="h-4 w-4 mr-1 animate-spin" />
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
        </CardContent>
      </Card>

      {/* Load Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Load #{load.landstar_load_id || 'N/A'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={`${getStatusColor(load.status)} text-white`}>
                {getStatusLabel(load.status)}
              </Badge>
            </div>

            {/* Origin */}
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Origin
              </span>
              <p className="text-sm font-medium">{load.origin}</p>
            </div>

            {/* Destination */}
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Destination
              </span>
              <p className="text-sm font-medium">{load.destination}</p>
            </div>

            {/* Dates & Times */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Pickup
                </span>
                <p className="text-sm font-medium">{formatDate(load.pickup_date)}</p>
                {load.pickup_time && (
                  <p className="text-xs text-primary font-medium">{load.pickup_time}</p>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Delivery
                </span>
                <p className="text-sm font-medium">{formatDate(load.delivery_date)}</p>
                {load.delivery_time && (
                  <p className="text-xs text-primary font-medium">{load.delivery_time}</p>
                )}
              </div>
            </div>

            {/* Miles and Pay */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Route className="h-3 w-3" /> Booked Miles
                </span>
                <p className="text-sm font-medium">{load.booked_miles?.toLocaleString() || 0}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Estimated Pay
                </span>
                <p className="text-sm font-medium text-success">{formatCurrency(estimatedPay)}</p>
              </div>
            </div>

            {/* Notes */}
            {load.notes && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <p className="text-xs text-warning font-medium uppercase tracking-wide mb-2">
                  Special Instructions
                </p>
                <ScrollArea className="max-h-40">
                  <div className="pr-3">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{load.notes}</p>
                  </div>
                </ScrollArea>
                <p className="text-[10px] text-warning/60 mt-1 italic">Scroll for more ↓</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function DriverLoadsView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('current');

  // Fetch driver record for current user
  const { data: driverRecord } = useQuery({
    queryKey: ['driver_record', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch driver's loads
  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['driver_loads', driverRecord?.id],
    queryFn: async () => {
      if (!driverRecord?.id) return [];
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*')
        .eq('driver_id', driverRecord.id);
      if (error) throw error;
      return data;
    },
    enabled: !!driverRecord?.id,
  });

  // Sort loads chronologically based on status
  // For in_transit: sort by delivery_date
  // For others: sort by pickup_date
  // Earliest dates first
  const sortLoadsChronologically = (loadsToSort: Load[]): Load[] => {
    return [...loadsToSort].sort((a, b) => {
      const dateA = a.status === 'in_transit' 
        ? (a.delivery_date || a.pickup_date || '') 
        : (a.pickup_date || '');
      const dateB = b.status === 'in_transit' 
        ? (b.delivery_date || b.pickup_date || '') 
        : (b.pickup_date || '');
      
      // Parse dates for comparison
      const timeA = dateA ? new Date(dateA).getTime() : Infinity;
      const timeB = dateB ? new Date(dateB).getTime() : Infinity;
      
      return timeA - timeB; // Ascending order (earliest first)
    });
  };

  const handleStatusUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['driver_loads'] });
    queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
  };

  // Categorize and sort loads
  // Current: only in_transit and loading (actively on the road)
  const currentLoads = sortLoadsChronologically(
    loads.filter((load: Load) => ['loading', 'in_transit'].includes(load.status))
  );

  // Upcoming: pending and assigned loads
  const upcomingLoads = sortLoadsChronologically(
    loads.filter((load: Load) => ['pending', 'assigned'].includes(load.status))
  );

  // Completed: sorted most recent first (reverse chronological)
  const completedLoads = [...loads.filter((load: Load) => 
    ['delivered', 'cancelled'].includes(load.status)
  )].sort((a, b) => {
    const dateA = a.delivery_date || a.pickup_date || '';
    const dateB = b.delivery_date || b.pickup_date || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime(); // Most recent first
  });

  // Get driver pay info
  const payRate = driverRecord?.pay_rate || 0;
  const payType = driverRecord?.pay_type || 'per_mile';

  if (!driverRecord) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg">No Driver Profile</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Your account is not linked to a driver profile. Please contact your dispatcher.
        </p>
      </div>
    );
  }

  const renderLoadsList = (loadsList: Load[], emptyMessage: string) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (loadsList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {loadsList.map((load: Load) => (
          <DriverLoadCard
            key={load.id}
            load={load}
            payRate={payRate}
            payType={payType}
            onStatusUpdate={handleStatusUpdate}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="current" className="text-xs sm:text-sm">
            Current ({currentLoads.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs sm:text-sm">
            Upcoming ({upcomingLoads.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs sm:text-sm">
            Completed ({completedLoads.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4">
          {renderLoadsList(currentLoads, 'No current loads assigned')}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          {renderLoadsList(upcomingLoads, 'No upcoming loads scheduled')}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {renderLoadsList(completedLoads, 'No completed loads yet')}
        </TabsContent>
      </Tabs>
    </div>
  );
}
