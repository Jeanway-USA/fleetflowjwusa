import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Wrench, Plus, Clock, CheckCircle, AlertTriangle, Settings } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { MaintenanceRequestForm } from './MaintenanceRequestForm';

interface MaintenanceRequest {
  id: string;
  issue_type: string;
  description: string;
  priority: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  trucks?: { unit_number: string } | null;
}

interface MaintenanceRequestCardProps {
  requests: MaintenanceRequest[];
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

export function MaintenanceRequestCard({ requests, driverId, truckId }: MaintenanceRequestCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const openRequests = requests.filter(r => r.status !== 'completed');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
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

      <CardContent>
        {openRequests.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-success" />
            <p className="text-sm">No open maintenance requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openRequests.map((request) => (
              <div
                key={request.id}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(request.status)}
                    <span className="font-medium capitalize text-sm">
                      {request.issue_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex gap-1">
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

                <p className="text-xs text-muted-foreground">
                  Submitted {format(parseISO(request.created_at), 'MMM d, h:mm a')}
                  {request.trucks?.unit_number && ` • Truck ${request.trucks.unit_number}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
