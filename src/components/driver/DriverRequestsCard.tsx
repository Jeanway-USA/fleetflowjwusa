import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Clock, Home, CalendarDays, Wrench, Plus, MessageSquare } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { DriverRequestForm } from './DriverRequestForm';

type RequestType = 'detention' | 'home_time' | 'pto' | 'maintenance';

interface DriverRequestsCardProps {
  driverId: string;
  truckId?: string;
  activeLoadId?: string;
  activeLoadNumber?: string | null;
}

const TYPE_META: Record<RequestType, { label: string; icon: React.ReactNode }> = {
  detention: { label: 'Detention', icon: <Clock className="h-3.5 w-3.5" /> },
  home_time: { label: 'Home Time', icon: <Home className="h-3.5 w-3.5" /> },
  pto: { label: 'PTO', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  maintenance: { label: 'Issue', icon: <Wrench className="h-3.5 w-3.5" /> },
};

function getStatusVariant(status: string) {
  switch (status) {
    case 'approved': return 'default';
    case 'denied': return 'destructive';
    case 'completed': return 'secondary';
    default: return 'outline';
  }
}

export function DriverRequestsCard({ driverId, truckId, activeLoadId, activeLoadNumber }: DriverRequestsCardProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<RequestType>('detention');

  const { data: requests = [] } = useQuery({
    queryKey: ['driver-requests', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_requests')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  const openRequests = requests.filter((r) => r.status === 'pending');
  const recentResolved = requests.filter((r) => r.status !== 'pending').slice(0, 5);

  const openForm = (type: RequestType) => {
    setDefaultType(type);
    setFormOpen(true);
  };

  const handleSuccess = () => {
    setFormOpen(false);
    queryClient.invalidateQueries({ queryKey: ['driver-requests', driverId] });
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              My Requests
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openForm('detention')}>
              <Plus className="h-3 w-3" />
              New
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Quick action buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {(['detention', 'home_time', 'pto', 'maintenance'] as RequestType[]).map((type) => {
              const meta = TYPE_META[type];
              return (
                <button
                  key={type}
                  onClick={() => openForm(type)}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-xs text-muted-foreground hover:text-foreground"
                >
                  {meta.icon}
                  <span className="truncate w-full text-center">{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* Open requests */}
          {openRequests.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending</p>
              {openRequests.map((req) => {
                const meta = TYPE_META[req.request_type as RequestType] || TYPE_META.detention;
                return (
                  <div key={req.id} className="flex items-center gap-2 p-2 rounded-md bg-warning/5 border border-warning/20 text-sm">
                    <span className="text-warning">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="truncate block font-medium">{req.subject}</span>
                      {req.start_date && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(req.start_date), 'MMM d')}
                          {req.end_date ? ` – ${format(new Date(req.end_date), 'MMM d')}` : ''}
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">Pending</Badge>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent resolved */}
          {recentResolved.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent</p>
              {recentResolved.map((req) => {
                const meta = TYPE_META[req.request_type as RequestType] || TYPE_META.detention;
                return (
                  <div key={req.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-sm">
                    <span className="text-muted-foreground">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{req.subject}</span>
                      {req.start_date && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(req.start_date), 'MMM d')}
                          {req.end_date ? ` – ${format(new Date(req.end_date), 'MMM d')}` : ''}
                        </p>
                      )}
                      {req.response_notes && (
                        <p className="text-xs text-muted-foreground truncate">Reply: {req.response_notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end shrink-0 gap-0.5">
                      <Badge variant={getStatusVariant(req.status)} className="text-xs capitalize">
                        {req.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {requests.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No requests yet. Use the buttons above to submit one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Request Form Sheet */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Request</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <DriverRequestForm
              driverId={driverId}
              truckId={truckId}
              activeLoadId={activeLoadId}
              activeLoadNumber={activeLoadNumber}
              defaultType={defaultType}
              onSuccess={handleSuccess}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
