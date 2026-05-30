import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, Loader2 } from 'lucide-react';

const PAGE_SIZE = 10;

const ACTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  template_created: { label: 'Created', variant: 'default' },
  template_updated: { label: 'Updated', variant: 'secondary' },
  template_activated: { label: 'Activated', variant: 'default' },
  template_deactivated: { label: 'Deactivated', variant: 'outline' },
  template_deleted: { label: 'Deleted', variant: 'destructive' },
};

function formatAction(action: string, details: any): { verb: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; description: string } {
  const meta = ACTION_LABELS[action] ?? { label: action, variant: 'secondary' as const };
  const name = details?.name || details?.document_type || 'Document Template';
  return {
    verb: meta.label,
    variant: meta.variant,
    description: `${meta.label} ${name}`,
  };
}

export function AuditLogPanel() {
  const { orgId } = useAuth();
  const [pageCount, setPageCount] = useState(1);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-logs-document-templates', orgId, pageCount],
    queryFn: async () => {
      if (!orgId) return { rows: [], hasMore: false };
      const limit = PAGE_SIZE * pageCount;
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('id, action, details, created_at, user_id, record_id')
        .eq('org_id', orgId)
        .eq('table_name', 'document_template')
        .order('created_at', { ascending: false })
        .limit(limit + 1);
      if (error) throw error;

      const userIds = Array.from(new Set((logs ?? []).map((l) => l.user_id).filter(Boolean)));
      let profilesById: Record<string, { first_name: string | null; last_name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds);
        profilesById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      }

      const hasMore = (logs?.length ?? 0) > limit;
      const rows = (logs ?? []).slice(0, limit).map((l) => ({
        ...l,
        profile: profilesById[l.user_id] ?? null,
      }));
      return { rows, hasMore };
    },
    enabled: !!orgId,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const rows = data?.rows ?? [];
  const hasMore = data?.hasMore ?? false;

  const formatTimestamp = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const displayName = (profile: { first_name: string | null; last_name: string | null; email: string | null } | null) => {
    if (!profile) return 'Unknown';
    const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    return full || profile.email || 'Unknown';
  };

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Activity Log
        </CardTitle>
        <CardDescription>
          Recent administrator changes to document templates. Most recent first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading activity…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No template changes have been recorded yet.
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Timestamp</TableHead>
                    <TableHead className="w-[180px]">Administrator</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const a = formatAction(row.action, row.details);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {formatTimestamp(row.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">{displayName(row.profile)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={a.variant}>{a.verb}</Badge>
                            <span className="text-sm">{a.description}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {hasMore && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => setPageCount((c) => c + 1)}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
                    </>
                  ) : (
                    'Load More'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
