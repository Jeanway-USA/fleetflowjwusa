import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  exportFilename?: string;
}

function exportToCsv<T extends { id: string }>(columns: Column<T>[], data: T[], filename: string) {
  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const header = columns.map(c => escape(c.header)).join(',');
  const rows = data.map(item =>
    columns.map(col => escape(String(item[col.key as keyof T] ?? ''))).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ROW_HEIGHT = 48;

export function DataTable<T extends { id: string }>({ 
  columns, 
  data, 
  loading, 
  emptyMessage = "No data found",
  onRowClick,
  exportFilename,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  if (loading) {
    return (
      <div className="rounded-lg border border-border">
        <table className="w-full caption-bottom text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors bg-muted/50">
              {columns.map((col, i) => (
                <th key={i} className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i} className="border-b">
                {columns.map((_, j) => (
                  <td key={j} className="p-4 align-middle">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border p-12 text-center">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {exportFilename && data.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToCsv(columns, data, exportFilename)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="rounded-lg border border-border overflow-auto"
        style={{ maxHeight: 600 }}
      >
        <table className="w-full caption-bottom text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background">
            <tr className="border-b transition-colors bg-muted/50">
              {columns.map((col, i) => (
                <th key={i} className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
              display: 'block',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = data[virtualRow.index];
              return (
                <tr
                  key={item.id}
                  data-index={virtualRow.index}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50",
                    onRowClick && "cursor-pointer"
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'table',
                    tableLayout: 'fixed',
                  }}
                >
                  {columns.map((col, j) => (
                    <td key={j} className="p-4 align-middle">
                      {col.render
                        ? col.render(item)
                        : String(item[col.key as keyof T] ?? '-')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
