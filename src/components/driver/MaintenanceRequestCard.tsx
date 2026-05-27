import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Wrench, Plus, Clock, CheckCircle, Settings, MessageSquare, History } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { MaintenanceRequestForm } from './MaintenanceRequestForm';
import { MaintenanceThread } from '@/components/maintenance/MaintenanceThread';
import {
  useDriverMaintenanceRequests,
  type DriverMaintenanceRequest,
} from '@/hooks/useDriverMaintenanceRequests';

interface MaintenanceRequestCardProps {
  driverId: string;
  truckId: string | undefined;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-success" />;
    case 'scheduled':
    case 'in_progress':
      return <Settings className="h-4 w-4 text-primary animate-spin" />;
    case 'acknowledged':
      return <Clock className="h-4 w-4 text-warning" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-success text-success-foreground">Completed</Badge>;
    case 'scheduled':
      return <Badge className="bg-primary text-primary-foreground">Scheduled</Badge>;
    case 'in_progress':
      return <Badge className="bg-primary text-primary-foreground">In Progress</Badge>;
    case 'acknowledged':
      return <Badge className="bg-warning text-warning-foreground">Acknowledged</Badge>;
    default:
      return <Badge variant="secondary">Submitted</Badge>;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case 'critical':
      return <Badge variant="destructive">Critical</Badge>;
    case 'high':
      return <Badge className="bg-warning text-warning-foreground">High</Badge>;
    case 'medium':
      return <Badge variant="secondary">Medium</Badge>;
    default:
      return <Badge variant="outline">Low</Badge>;
  }
}

function DriverRequestItem({ request }: { request: DriverMaintenanceRequest }) {
  const [threadOpen, setThreadOpen] = useState(false);
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {getStatusIcon(request.status)}
          <span className="font-medium capitalize text-sm">
            {request.issue_type.replace('_', ' ')}
          </span>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {getPriorityBadge(request.priority)}
          {getStatusBadge(request.status)}
        </div>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2">
        {request.description}
      </p>

      {request.admin_notes && (
        <div className="bg-primary/10 rounded p-2 text-sm">
          <p className="text-xs text-muted-foreground mb-1">Shop Response:</p>
          <p>{request.admin_notes}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Submitted {format(parseISO(request.created_at), 'MMM d, h:mm a')}
          {request.trucks?.unit_number && ` • Truck ${request.trucks.unit_number}`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8"
          onClick={() => setThreadOpen((v) => !v)}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {threadOpen ? 'Hide chat' : 'Chat with shop'}
        </Button>
      </div>

      {threadOpen && (
        <MaintenanceThread requestId={request.id} viewerRole="driver" />
      )}
    </div>
  );
}

export function MaintenanceRequestCard({ driverId, truckId }: MaintenanceRequestCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { data: requests = [], isLoading } = useDriverMaintenanceRequests(driverId);

  const openRequests = requests.filter((r) => r.status !== 'completed');
  const completedRequests = requests.filter((r) => r.status === 'completed');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Maintenance Requests
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!truckId}>
                <Plus className="h-4 w-4 mr-1" />
                Report Issue
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Report Maintenance Issue</DialogTitle>
              </DialogHeader>
              <MaintenanceRequestForm
                driverId={driverId}
                truckId={truckId!}
                onComplete={() => setDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-center py-6 text-sm text-muted-foreground">Loading…</div>
        ) : openRequests.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-success" />
            <p className="text-sm">No open maintenance requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openRequests.map((request) => (
              <DriverRequestItem key={request.id} request={request} />
            ))}
          </div>
        )}

        {completedRequests.length > 0 && (
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setShowHistory((v) => !v)}
            >
              <History className="h-3.5 w-3.5" />
              {showHistory ? 'Hide history' : `Show history (${completedRequests.length})`}
            </Button>
            {showHistory && (
              <div className="space-y-3 mt-3">
                {completedRequests.map((request) => (
                  <DriverRequestItem key={request.id} request={request} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
