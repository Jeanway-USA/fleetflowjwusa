import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Loader2 } from 'lucide-react';
import { ChangeDiffModal } from './ChangeDiffModal';
import type { AuditLogRow } from '@/hooks/useAuditLogs';

interface Props {
  rows: AuditLogRow[];
  isLoading: boolean;
}

export function LiveActivityFeed({ rows, isLoading }: Props) {
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading activity…
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-12 text-center">No audit entries match the current filters.</p>;
  }

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">Timestamp</TableHead>
              <TableHead className="w-[120px]">Action</TableHead>
              <TableHead className="w-[170px]">Resource</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="w-[100px]">Role</TableHead>
              <TableHead className="w-[110px] text-right">Changes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={row.action === 'DELETE' ? 'destructive' : row.action === 'INSERT' ? 'default' : 'secondary'}>
                    {row.action}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{row.table_name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{row.record_id?.slice(0, 8) ?? '—'}</div>
                </TableCell>
                <TableCell className="text-sm">{row.user_name ?? <span className="text-muted-foreground">system</span>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.user_role ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ChangeDiffModal row={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
