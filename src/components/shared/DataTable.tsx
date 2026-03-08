import { useRef, useState, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Download, SlidersHorizontal, RotateCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
  tableId?: string;
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

function getStorageKey(tableId: string) {
  return `datatable-view-${tableId}`;
}

export function DataTable<T extends { id: string }>({ 
  columns, 
  data, 
  loading, 
  emptyMessage = "No data found",
  onRowClick,
  exportFilename,
  tableId,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (tableId) {
      try {
        const saved = localStorage.getItem(getStorageKey(tableId));
        if (saved) return JSON.parse(saved);
      } catch { /* ignore */ }
    }
    return {};
  });

  useEffect(() => {
    if (tableId) {
      localStorage.setItem(getStorageKey(tableId), JSON.stringify(columnVisibility));
    }
  }, [columnVisibility, tableId]);

  const visibleColumns = useMemo(
    () => columns.filter(col => columnVisibility[String(col.key)] !== false),
    [columns, columnVisibility]
  );

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const toggleColumn = (key: string) => {
    setColumnVisibility(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false,
    }));
  };

  const resetVisibility = () => setColumnVisibility({});

  const hasToolbar = exportFilename || tableId;

  if (loading) {
    return (
      <div className="rounded-lg border border-border">
        <table className="w-full caption-bottom text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors bg-muted/50">
              {visibleColumns.map((col, i) => (
                <th key={i} className="h-12 px-4 text-left align-middle font-semibold text-muted-foreground">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i} className="border-b">
                {visibleColumns.map((_, j) => (
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
      {hasToolbar && (
        <div className="flex justify-end gap-2">
          {tableId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  View
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {columns.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={String(col.key)}
                    checked={columnVisibility[String(col.key)] !== false}
                    onCheckedChange={() => toggleColumn(String(col.key))}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {col.header}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={resetVisibility}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Reset to default
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {exportFilename && data.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv(visibleColumns, data, exportFilename)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        className="rounded-lg border border-border overflow-auto"
        style={{ maxHeight: 600 }}
      >
        <table className="w-full caption-bottom text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background" style={{ display: 'block' }}>
            <tr className="border-b transition-colors bg-muted/50" style={{ display: 'table', tableLayout: 'fixed', width: '100%' }}>
              {visibleColumns.map((col, i) => (
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
                  {visibleColumns.map((col, j) => (
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
