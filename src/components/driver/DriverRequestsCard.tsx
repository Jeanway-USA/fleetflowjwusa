import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, Clock, Home } from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { DriverRequestForm } from './DriverRequestForm';
import { Chip, Note, Panel, PanelHead, SheetContent, Tile } from '@/components/driver/ui/driver-ui';

type RequestType = 'detention' | 'home_time' | 'pto' | 'maintenance';

interface DriverRequestsCardProps {
  driverId: string;
  truckId?: string;
  activeLoadId?: string;
  activeLoadNumber?: string | null;
}

const TYPE_LABEL: Record<RequestType, string> = {
  detention: 'Detention',
  home_time: 'Home time',
  pto: 'PTO',
  maintenance: 'Issue',
};

const STATUS_TONE: Record<string, 'neutral' | 'warn' | 'good' | 'bad'> = {
  pending: 'warn',
  approved: 'good',
  completed: 'neutral',
  denied: 'bad',
};

function dates(start: string | null, end: string | null) {
  if (!start) return null;
  return `${format(parseISO(start), 'MMM d')}${end ? ` to ${format(parseISO(end), 'MMM d')}` : ''}`;
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
    staleTime: 2 * 60 * 1000,
  });

  const shown = [...requests.filter((r) => r.status === 'pending'), ...requests.filter((r) => r.status !== 'pending').slice(0, 5)];

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
      <Panel>
        <PanelHead title="My requests" />
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          <Tile icon={<Clock />} label={TYPE_LABEL.detention} onClick={() => openForm('detention')} />
          <Tile icon={<Home />} label={TYPE_LABEL.home_time} onClick={() => openForm('home_time')} />
          <Tile icon={<CalendarDays />} label={TYPE_LABEL.pto} onClick={() => openForm('pto')} />
        </div>

        {shown.length > 0 ? (
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((req) => {
              const when = dates(req.start_date, req.end_date);
              return (
                <li key={req.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{req.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {TYPE_LABEL[req.request_type as RequestType] ?? 'Request'}
                      {when ? `, ${when}` : ''}
                    </p>
                    {req.response_notes && <p className="mt-0.5 text-xs text-muted-foreground">Reply: {req.response_notes}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <Chip tone={STATUS_TONE[req.status] ?? 'neutral'} className="capitalize">{req.status}</Chip>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Note className="border-t border-border">No requests yet. Tap one above to send it.</Note>
        )}
      </Panel>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
          </DialogHeader>
          <DriverRequestForm
            driverId={driverId}
            truckId={truckId}
            activeLoadId={activeLoadId}
            activeLoadNumber={activeLoadNumber}
            defaultType={defaultType}
            onSuccess={handleSuccess}
            onCancel={() => setFormOpen(false)}
          />
        </SheetContent>
      </Dialog>
    </>
  );
}
