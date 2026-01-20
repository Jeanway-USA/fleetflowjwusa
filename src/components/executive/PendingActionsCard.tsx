import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, FileText, Wrench, AlertCircle, Calendar, ChevronRight, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface PendingAction {
  id: string;
  type: 'document' | 'maintenance' | 'defect' | 'credential' | 'settlement';
  title: string;
  count: number;
  priority: 'high' | 'medium' | 'low';
  link?: string;
}

interface PendingActionsCardProps {
  actions: PendingAction[];
  isLoading?: boolean;
}

const typeConfig: Record<PendingAction['type'], { icon: typeof FileText; label: string }> = {
  document: { icon: FileText, label: 'Documents' },
  maintenance: { icon: Wrench, label: 'Maintenance' },
  defect: { icon: AlertCircle, label: 'Defects' },
  credential: { icon: Calendar, label: 'Credentials' },
  settlement: { icon: Receipt, label: 'Finance' },
};

const priorityColors: Record<PendingAction['priority'], string> = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-yellow-500 text-yellow-950',
  low: 'bg-muted text-muted-foreground',
};

export function PendingActionsCard({ actions, isLoading }: PendingActionsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Pending Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const totalCount = actions.reduce((sum, a) => sum + a.count, 0);
  const highPriorityCount = actions.filter(a => a.priority === 'high').reduce((sum, a) => sum + a.count, 0);

  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Pending Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">All caught up!</p>
            <p className="text-xs">No pending actions at this time.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Pending Actions
          </span>
          <Badge variant={highPriorityCount > 0 ? 'destructive' : 'secondary'} className="text-xs">
            {totalCount} items
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map(action => {
          const config = typeConfig[action.type];
          const Icon = config.icon;
          
          const content = (
            <div
              key={action.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-background">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{config.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${priorityColors[action.priority]} text-xs`}>
                  {action.count}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          );

          if (action.link) {
            return (
              <Link key={action.id} to={action.link}>
                {content}
              </Link>
            );
          }

          return content;
        })}
      </CardContent>
    </Card>
  );
}
