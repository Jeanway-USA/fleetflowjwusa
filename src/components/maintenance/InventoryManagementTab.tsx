import { useMemo, useState } from 'react';
import { MoreHorizontal, Package, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAllPartsInventory, type PartInventoryItem } from '@/hooks/useMaintenanceData';

function statusBadge(p: PartInventoryItem) {
  const qty = Number(p.quantity_on_hand);
  const min = Number(p.min_threshold);
  if (qty <= 0) {
    return (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20">
        Out of Stock
      </Badge>
    );
  }
  if (qty <= min) {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">
        Low Stock
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">
      In Stock
    </Badge>
  );
}

export function InventoryManagementTab() {
  const { data, isLoading } = useAllPartsInventory();
  const [query, setQuery] = useState('');

  const parts = data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter(p =>
      [p.part_name, p.part_number, p.vendor_name, p.category]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)),
    );
  }, [parts, query]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by part name, number, or vendor…"
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? 'Loading inventory…'
            : query
              ? `${filtered.length} of ${parts.length} parts`
              : `${parts.length} part${parts.length === 1 ? '' : 's'} total`}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">Part</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Min. Threshold</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <Package className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {parts.length === 0
                      ? 'No inventory yet. Add your first part to get started.'
                      : 'No parts match your search.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(p => {
                const qty = Number(p.quantity_on_hand);
                const min = Number(p.min_threshold);
                const low = qty <= min;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.part_name}</div>
                      {p.part_number && (
                        <div className="text-xs text-muted-foreground">#{p.part_number}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{p.vendor_name ?? '—'}</span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        low && 'text-amber-600 dark:text-amber-400',
                        qty <= 0 && 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {qty} {p.unit}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {min} {p.unit}
                    </TableCell>
                    <TableCell>{statusBadge(p)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Manage</DropdownMenuLabel>
                          <DropdownMenuItem disabled>Edit part</DropdownMenuItem>
                          <DropdownMenuItem disabled>Adjust quantity</DropdownMenuItem>
                          <DropdownMenuItem disabled>Request reorder</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled className="text-destructive">
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default InventoryManagementTab;
