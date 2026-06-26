import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { AuditLogRow } from '@/hooks/useAuditLogs';

interface Props {
  row: AuditLogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function diffKeys(prev: any, next: any): string[] {
  const keys = new Set<string>();
  if (prev && typeof prev === 'object') Object.keys(prev).forEach(k => keys.add(k));
  if (next && typeof next === 'object') Object.keys(next).forEach(k => keys.add(k));
  return Array.from(keys)
    .filter(k => JSON.stringify(prev?.[k]) !== JSON.stringify(next?.[k]))
    .sort();
}

function fmt(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export function ChangeDiffModal({ row, open, onOpenChange }: Props) {
  if (!row) return null;
  const keys = diffKeys(row.previous_values, row.new_values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant={row.action === 'DELETE' ? 'destructive' : row.action === 'INSERT' ? 'default' : 'secondary'}>
              {row.action}
            </Badge>
            <span className="font-mono text-sm">{row.table_name}</span>
            <span className="text-xs text-muted-foreground font-mono">{row.record_id?.slice(0, 8)}…</span>
          </DialogTitle>
          <DialogDescription>
            By {row.user_name ?? 'system'} · {row.user_role ?? '—'} · {new Date(row.created_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1">
          {!row.previous_values && !row.new_values ? (
            <pre className="text-xs font-mono bg-muted rounded p-3 whitespace-pre-wrap">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No field-level changes recorded.</p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 w-1/4">Field</th>
                    <th className="text-left p-2 w-3/8">Previous</th>
                    <th className="text-left p-2 w-3/8">New</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k} className="border-t align-top">
                      <td className="p-2 font-mono">{k}</td>
                      <td className="p-2 font-mono bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 break-all">
                        {fmt(row.previous_values?.[k])}
                      </td>
                      <td className="p-2 font-mono bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200 break-all">
                        {fmt(row.new_values?.[k])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
