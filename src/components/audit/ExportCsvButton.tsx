import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import type { AuditLogRow } from '@/hooks/useAuditLogs';

interface Props {
  rows: AuditLogRow[];
}

const COLS: (keyof AuditLogRow)[] = [
  'created_at', 'user_name', 'user_role', 'action', 'table_name',
  'record_id', 'ip_address', 'previous_values', 'new_values',
];

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ExportCsvButton({ rows }: Props) {
  const handleExport = () => {
    const header = COLS.join(',');
    const body = rows.map(r => COLS.map(c => csvEscape(r[c])).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV ({rows.length})
    </Button>
  );
}
