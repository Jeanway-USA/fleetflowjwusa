import { Dialog, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MessageSquare, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { MaintenanceRequestForm } from './MaintenanceRequestForm';
import { MaintenanceThread } from '@/components/maintenance/MaintenanceThread';
import { useDriverMaintenanceRequests, type DriverMaintenanceRequest } from '@/hooks/useDriverMaintenanceRequests';
import { Chip, DBtn, Note, Panel, PanelHead, SheetContent } from '@/components/driver/ui/driver-ui';

interface MaintenanceRequestCardProps {
  driverId: string;
  truckId: string | undefined;
}

const STATUS: Record<string, { word: string; tone: 'neutral' | 'active' | 'warn' | 'good' }> = {
  completed: { word: 'Completed', tone: 'good' },
  scheduled: { word: 'Scheduled', tone: 'active' },
  in_progress: { word: 'In progress', tone: 'active' },
  acknowledged: { word: 'Acknowledged', tone: 'warn' },
};

const PRIORITY: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

function DriverRequestItem({ request }: { request: DriverMaintenanceRequest }) {
  const [threadOpen, setThreadOpen] = useState(false);
  const status = STATUS[request.status] ?? { word: 'Submitted', tone: 'neutral' as const };
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold capitalize">{request.issue_type.replace('_', ' ')}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{request.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <Chip tone={status.tone}>{status.word}</Chip>
          <p className={request.priority === 'critical' ? 'mt-1 text-xs font-semibold text-destructive' : 'mt-1 text-xs text-muted-foreground'}>{PRIORITY[request.priority] ?? request.priority}</p>
        </div>
      </div>

      {request.admin_notes && (
        <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">Shop response</p>
          <p className="mt-0.5">{request.admin_notes}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {format(parseISO(request.created_at), 'MMM d, h:mm a')}
          {request.trucks?.unit_number && `, truck ${request.trucks.unit_number}`}
        </p>
        <DBtn tone="ghost" size="md" onClick={() => setThreadOpen((v) => !v)}>
          <MessageSquare className="!size-4" />
          {threadOpen ? 'Hide chat' : 'Chat with shop'}
        </DBtn>
      </div>

      {threadOpen && <MaintenanceThread requestId={request.id} viewerRole="driver" />}
    </li>
  );
}

export function MaintenanceRequestCard({ driverId, truckId }: MaintenanceRequestCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { data: requests = [], isLoading } = useDriverMaintenanceRequests(driverId);

  const openRequests = requests.filter((r) => r.status !== 'completed');
  const completedRequests = requests.filter((r) => r.status === 'completed');

  return (
    <Panel>
      <PanelHead
        title="Maintenance"
        aside={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <DBtn tone="secondary" size="md" disabled={!truckId}><Plus className="!size-4" /> Report issue</DBtn>
            </DialogTrigger>
            <SheetContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Report an issue</DialogTitle>
              </DialogHeader>
              <MaintenanceRequestForm driverId={driverId} truckId={truckId!} onComplete={() => setDialogOpen(false)} />
            </SheetContent>
          </Dialog>
        }
      />
      {isLoading ? (
        <Note>Loading</Note>
      ) : openRequests.length === 0 ? (
        <Note>No open maintenance requests.</Note>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {openRequests.map((request) => <DriverRequestItem key={request.id} request={request} />)}
        </ul>
      )}

      {completedRequests.length > 0 && (
        <div className="border-t border-border p-2">
          <DBtn tone="ghost" size="md" className="w-full text-muted-foreground" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide history' : `Show history (${completedRequests.length})`}
          </DBtn>
          {showHistory && <ul className="divide-y divide-border">{completedRequests.map((request) => <DriverRequestItem key={request.id} request={request} />)}</ul>}
        </div>
      )}
    </Panel>
  );
}
