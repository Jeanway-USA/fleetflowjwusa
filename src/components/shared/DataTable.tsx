import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Download, SlidersHorizontal, RotateCcw, Rows3, AlignJustify, X, Filter, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
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
import { EmptyState } from '@/components/shared/EmptyState';
import { LucideIcon } from 'lucide-react';

type Density = 'standard' | 'compact';

const DENSITY_STORAGE_KEY = 'datatable-density';

function getDensityConfig(density: Density) {
  if (density === 'compact') {
    return { rowHeight: 32, thClass: 'h-8 px-3 text-xs', tdClass: 'px-3 text-xs' };
  }
  return { rowHeight: 48, thClass: 'h-12 px-4 text-sm', tdClass: 'px-4 text-sm' };
}

type ColumnFilter<T> =
  | { type: 'text'; accessor?: (item: T) => string | null | undefined }
  | { type: 'date-range'; accessor: (item: T) => string | null | undefined };

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
  hiddenOnMobile?: boolean;
  filter?: ColumnFilter<T>;
  sortable?: boolean;
  sortAccessor?: (item: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  onRowDoubleClick?: (item: T) => void;
  exportFilename?: string;
  tableId?: string;
  emptyIcon?: LucideIcon;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
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

type FilterValue = string | { from?: string; to?: string };

export function DataTable<T extends { id: string }>({ 
  columns, 
  data, 
  loading, 
  emptyMessage = "No data found",
  onRowClick,
  onRowDoubleClick,
  exportFilename,
  tableId,
  emptyIcon,
  emptyDescription,
  emptyAction,
  selectable,
  selectedIds,
  onSelectionChange,
  bulkActions,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: '' });

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
  const hasAnyFilter = useMemo(() => columns.some(c => c.filter), [columns]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>({});

  const activeFilterCount = useMemo(() => {
    return Object.values(filterValues).filter(v => {
      if (!v) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      return Boolean(v.from || v.to);
    }).length;
  }, [filterValues]);

  // Apply column filters
  const filteredData = useMemo(() => {
    if (activeFilterCount === 0) return data;
    return data.filter(item => {
      for (const col of columns) {
        if (!col.filter) continue;
        const key = String(col.key);
        const raw = filterValues[key];
        if (!raw) continue;
        if (col.filter.type === 'text') {
          const needle = (typeof raw === 'string' ? raw : '').trim().toLowerCase();
          if (!needle) continue;
          const value = col.filter.accessor
            ? col.filter.accessor(item)
            : (item[col.key as keyof T] as unknown);
          const hay = String(value ?? '').toLowerCase();
          if (!hay.includes(needle)) return false;
        } else if (col.filter.type === 'date-range') {
          const range = typeof raw === 'string' ? {} : raw;
          if (!range.from && !range.to) continue;
          const value = col.filter.accessor(item);
          if (!value) return false;
          const v = String(value).slice(0, 10);
          if (range.from && v < range.from) return false;
          if (range.to && v > range.to) return false;
        }
      }
      return true;
    });
  }, [data, columns, filterValues, activeFilterCount]);

  // Sort state
  const [sortState, setSortState] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const sortedData = useMemo(() => {
    if (!sortState) return filteredData;
    const col = columns.find(c => String(c.key) === sortState.key);
    if (!col) return filteredData;
    const accessor = col.sortAccessor ?? ((item: T) => item[col.key as keyof T] as unknown as string | number | null | undefined);
    const dir = sortState.dir === 'asc' ? 1 : -1;
    const arr = [...filteredData];
    arr.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      const aNil = av === null || av === undefined || av === '';
      const bNil = bv === null || bv === undefined || bv === '';
      if (aNil && bNil) return 0;
      if (aNil) return 1; // nulls last regardless of dir
      if (bNil) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
    return arr;
  }, [filteredData, sortState, columns]);

  const cycleSort = useCallback((key: string) => {
    setSortState(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const computedWidths = useMemo(() => {
    const defaultWidth = `${100 / visibleColumns.length}%`;
    return visibleColumns.map(col => col.width || defaultWidth);
  }, [visibleColumns]);

  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
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
  const clearFilters = () => setFilterValues({});

  // Selection helpers
  const safeSelectedIds = selectedIds ?? new Set<string>();
  const allSelected = filteredData.length > 0 && filteredData.every(item => safeSelectedIds.has(item.id));
  const someSelected = !allSelected && filteredData.some(item => safeSelectedIds.has(item.id));

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(filteredData.map(item => item.id)));
    }
  }, [allSelected, filteredData, onSelectionChange]);

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

  // Double-tap handler for touch devices
  const handleTouchEnd = useCallback((item: T) => {
    if (!onRowDoubleClick) return;
    const now = Date.now();
    if (now - lastTapRef.current.time < 300 && lastTapRef.current.id === (item as any).id) {
      onRowDoubleClick(item);
      lastTapRef.current = { time: 0, id: '' };
    } else {
      lastTapRef.current = { time: now, id: (item as any).id };
    }
  }, [onRowDoubleClick]);

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
          <table className="w-full caption-bottom min-w-[640px]" style={{ tableLayout: 'fixed' }}>
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors bg-muted/50">
                {showSelection && <th className={cn(thClass, "w-10")} />}
                {visibleColumns.map((col, i) => (
                  <th key={i} className={cn(thClass, "text-left align-middle font-semibold text-muted-foreground", col.hiddenOnMobile && "hidden md:table-cell")}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="border-b">
                  {showSelection && <td className={cn(tdClass, "w-10")}><Skeleton className="h-4 w-4" /></td>}
                  {visibleColumns.map((col, j) => (
                    <td key={j} className={cn(tdClass, "align-middle", col.hiddenOnMobile && "hidden md:table-cell")}>
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
      <div className="rounded-lg border border-border">
        <EmptyState
          icon={emptyIcon}
          title={emptyMessage}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        {hasAnyFilter && (
          <Button
            variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setFiltersOpen(o => !o)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        )}
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
        {exportFilename && filteredData.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToCsv(visibleColumns, filteredData, exportFilename)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {hasAnyFilter && filtersOpen && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-wrap items-end gap-3">
          {columns.filter(c => c.filter).map(col => {
            const key = String(col.key);
            if (col.filter?.type === 'text') {
              const value = (filterValues[key] as string) || '';
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{col.header}</label>
                  <Input
                    value={value}
                    placeholder={`Filter ${col.header.toLowerCase()}`}
                    className="h-8 w-44"
                    onChange={(e) => setFilterValues(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              );
            }
            if (col.filter?.type === 'date-range') {
              const range = (typeof filterValues[key] === 'object' ? filterValues[key] as { from?: string; to?: string } : {}) || {};
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{col.header}</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="date"
                      value={range.from || ''}
                      className="h-8 w-40"
                      onChange={(e) => setFilterValues(prev => ({ ...prev, [key]: { ...range, from: e.target.value || undefined } }))}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={range.to || ''}
                      className="h-8 w-40"
                      onChange={(e) => setFilterValues(prev => ({ ...prev, [key]: { ...range, to: e.target.value || undefined } }))}
                    />
                  </div>
                </div>
              );
            }
            return null;
          })}
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </Button>
          )}
        </div>
      )}

      <div className="relative">
        <div
          ref={scrollRef}
          className="rounded-lg border border-border overflow-auto"
          style={{ maxHeight: 600 }}
        >
          <table className="w-full caption-bottom min-w-[640px]" style={{ tableLayout: 'fixed' }}>
            <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background" style={{ display: 'block' }}>
              <tr className="border-b transition-colors bg-muted/50" style={{ display: 'table', tableLayout: 'fixed', width: '100%' }}>
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
                  <th key={i} className={cn(thClass, "text-left font-semibold text-muted-foreground", col.hiddenOnMobile && "hidden md:table-cell")} style={{ height: `${rowHeight}px`, width: computedWidths[i] }}>
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
              {filteredData.length === 0 && (
                <tr style={{ display: 'table', tableLayout: 'fixed', width: '100%' }}>
                  <td colSpan={visibleColumns.length + (showSelection ? 1 : 0)} className={cn(tdClass, "text-center text-muted-foreground py-8")}>
                    No rows match the current filters.
                  </td>
                </tr>
              )}
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = filteredData[virtualRow.index];
                const isSelected = showSelection && safeSelectedIds.has(item.id);
                return (
                  <tr
                    key={item.id}
                    data-index={virtualRow.index}
                    onClick={() => onRowClick?.(item)}
                    onDoubleClick={() => onRowDoubleClick?.(item)}
                    onTouchEnd={() => handleTouchEnd(item)}
                    className={cn(
                      "border-b transition-colors hover:bg-muted/50",
                      (onRowClick || onRowDoubleClick) && "cursor-pointer",
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
                      tableLayout: 'fixed',
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
                      <td key={j} className={cn(tdClass, col.hiddenOnMobile && "hidden md:table-cell")} style={{ height: `${virtualRow.size}px`, width: computedWidths[j] }}>
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
      </div>

      {/* Floating bulk action bar — fixed to viewport */}
      {showSelection && safeSelectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="flex items-center gap-4 rounded-full border border-border bg-background px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {safeSelectedIds.size} selected
              </span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={clearSelection}>
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            </div>
            {bulkActions && (
              <div className="flex items-center gap-2 border-l border-border pl-3">
                {bulkActions(safeSelectedIds)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
