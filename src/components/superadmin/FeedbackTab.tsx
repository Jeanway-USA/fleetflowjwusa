import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MessageSquare, Bug, Lightbulb } from 'lucide-react';
import { format } from 'date-fns';

type FilterType = 'all' | 'bug_report' | 'feature_request';

export function FeedbackTab() {
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: feedback, isLoading } = useQuery({
    queryKey: ['super-admin-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = feedback?.filter(f =>
    filter === 'all' ? true : f.feedback_type === filter
  ) ?? [];

  const bugCount = feedback?.filter(f => f.feedback_type === 'bug_report').length ?? 0;
  const featureCount = feedback?.filter(f => f.feedback_type === 'feature_request').length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          User Feedback
          <Badge variant="secondary" className="ml-2">{feedback?.length ?? 0} total</Badge>
          <Badge variant="destructive" className="ml-1">{bugCount} bugs</Badge>
          <Badge className="ml-1 bg-accent text-accent-foreground">{featureCount} features</Badge>
        </CardTitle>
        <ToggleGroup type="single" value={filter} onValueChange={v => v && setFilter(v as FilterType)} size="sm">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="bug_report"><Bug className="h-3 w-3 mr-1" />Bugs</ToggleGroupItem>
          <ToggleGroupItem value="feature_request"><Lightbulb className="h-3 w-3 mr-1" />Features</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Page</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(item.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.feedback_type === 'bug_report' ? 'destructive' : 'secondary'}>
                        {item.feedback_type === 'bug_report' ? 'Bug' : 'Feature'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{item.page_url || '—'}</TableCell>
                    <TableCell className="max-w-[400px] truncate">{item.description}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No feedback found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
