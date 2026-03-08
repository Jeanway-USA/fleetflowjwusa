import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, SlidersHorizontal, RotateCcw, Rows3, AlignJustify, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type Density = 'standard' | 'compact';

const DENSITY_STORAGE_KEY = 'datatable-density';

function getDensityConfig(density: Density) {
  if (density === 'compact') {
    return { rowHeight: 32, thClass: 'h-8 px-3 text-xs', tdClass: 'px-3 text-xs' };
  }
  return { rowHeight: 48, thClass: 'h-12 px-4 text-sm', tdClass: 'px-4 text-sm' };
}

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  exportFilename?: string;
  tableId?: string;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  bulkActions?: (ids: Set<string>) => React.ReactNode;
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
  selectable,
  selectedIds,
  onSelectionChange,
  bulkActions,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [density, setDensity] = useState<Density>(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      if (saved === 'compact' || saved === 'standard') return saved;
    } catch { /* ignore */ }
    return 'standard';
  });

  useEffect(() => {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  const { rowHeight, thClass, tdClass } = getDensityConfig(density);

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

  const showSelection = selectable && onSelectionChange;

  const computedWidths = useMemo(() => {
    const defaultWidth = `${100 / visibleColumns.length}%`;
    return visibleColumns.map(col => col.width || defaultWidth);
  }, [visibleColumns]);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [density, rowVirtualizer]);

  const toggleColumn = (key: string) => {
    setColumnVisibility(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false,
    }));
  };

  const resetVisibility = () => setColumnVisibility({});
  const toggleDensity = () => setDensity(prev => prev === 'standard' ? 'compact' : 'standard');

  // Selection helpers
  const safeSelectedIds = selectedIds ?? new Set<string>();
  const allSelected = data.length > 0 && data.every(item => safeSelectedIds.has(item.id));
  const someSelected = !allSelected && data.some(item => safeSelectedIds.has(item.id));

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(item => item.id)));
    }
  }, [allSelected, data, onSelectionChange]);

  const toggleRow = useCallback((id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(safeSelectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }, [safeSelectedIds, onSelectionChange]);

  const clearSelection = useCallback(() => {
    onSelectionChange?.(new Set());
  }, [onSelectionChange]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={toggleDensity}>
                  {density === 'compact' ? <Rows3 className="h-4 w-4" /> : <AlignJustify className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{density === 'compact' ? 'Standard density' : 'Compact density'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="rounded-lg border border-border">
          <table className="w-full caption-bottom" style={{ tableLayout: 'fixed' }}>
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors bg-muted/50">
                {showSelection && <th className={cn(thClass, "w-10")} />}
                {visibleColumns.map((col, i) => (
                  <th key={i} className={cn(thClass, "text-left align-middle font-semibold text-muted-foreground")}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="border-b">
                  {showSelection && <td className={cn(tdClass, "w-10")}><Skeleton className="h-4 w-4" /></td>}
                  {visibleColumns.map((_, j) => (
                    <td key={j} className={cn(tdClass, "align-middle")}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <div className="flex justify-end gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={density === 'compact' ? 'secondary' : 'outline'} size="sm" onClick={toggleDensity}>
                {density === 'compact' ? <Rows3 className="h-4 w-4" /> : <AlignJustify className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{density === 'compact' ? 'Standard density' : 'Compact density'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
      <div className="relative">
        <div
          ref={scrollRef}
          className="rounded-lg border border-border overflow-auto"
          style={{ maxHeight: 600 }}
        >
          <table className="w-full caption-bottom" style={{ tableLayout: 'fixed' }}>
            <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background" style={{ display: 'block' }}>
              <tr className="border-b transition-colors bg-muted/50" style={{ display: 'table', tableLayout: 'auto', width: '100%' }}>
                {showSelection && (
                  <th className={cn(thClass, "w-10 text-center")} style={{ width: '40px' }}>
                    <div className="flex items-center justify-center h-full">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleAll}
                        aria-label="Select all rows"
                      />
                    </div>
                  </th>
                )}
                {visibleColumns.map((col, i) => (
                  <th key={i} className={cn(thClass, "text-left font-semibold text-muted-foreground")} style={{ height: `${rowHeight}px`, width: col.width }}>
                    <div className="flex items-center h-full">{col.header}</div>
                  </th>
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
                const isSelected = showSelection && safeSelectedIds.has(item.id);
                return (
                  <tr
                    key={item.id}
                    data-index={virtualRow.index}
                    onClick={() => onRowClick?.(item)}
                    className={cn(
                      "border-b transition-colors hover:bg-muted/50",
                      onRowClick && "cursor-pointer",
                      isSelected && "bg-primary/5"
                    )}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      display: 'table',
                      tableLayout: 'auto',
                    }}
                  >
                    {showSelection && (
                      <td className={cn(tdClass, "w-10 text-center")} style={{ width: '40px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center h-full">
                          <Checkbox
                            checked={safeSelectedIds.has(item.id)}
                            onCheckedChange={() => toggleRow(item.id)}
                            aria-label={`Select row ${virtualRow.index + 1}`}
                          />
                        </div>
                      </td>
                    )}
                    {visibleColumns.map((col, j) => (
                      <td key={j} className={cn(tdClass)} style={{ height: `${virtualRow.size}px`, width: col.width }}>
                        <div className="flex items-center h-full">
                          {col.render
                            ? col.render(item)
                            : String(item[col.key as keyof T] ?? '-')}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Floating bulk action bar */}
        {showSelection && safeSelectedIds.size > 0 && (
          <div className="sticky bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-4 rounded-b-lg border border-t-border bg-background px-4 py-2 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">
                {safeSelectedIds.size} row{safeSelectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearSelection}>
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            </div>
            {bulkActions && (
              <div className="flex items-center gap-2">
                {bulkActions(safeSelectedIds)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}