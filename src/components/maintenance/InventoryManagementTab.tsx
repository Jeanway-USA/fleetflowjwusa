import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, MoreHorizontal, Package, Plus, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  useAllPartsInventory,
  useCreatePart,
  useUpdatePart,
  useReceiveShipment,
  useDeletePart,
  type PartInventoryItem,
  type CreatePartInput,
} from '@/hooks/useMaintenanceData';

// ----------------------------------------------------------------------------
// Validation schemas
// ----------------------------------------------------------------------------
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''));

const partSchema = z.object({
  part_name: z.string().trim().min(1, 'Part name is required').max(120),
  part_number: optionalText(60),
  vendor_name: optionalText(120),
  category: optionalText(60),
  unit: z.string().trim().min(1).max(20).default('ea'),
  quantity_on_hand: z.coerce.number().int('Must be a whole number').min(0).max(1_000_000),
  min_threshold: z.coerce.number().int('Must be a whole number').min(0).max(1_000_000),
});
type PartFormValues = z.infer<typeof partSchema>;

const editSchema = partSchema.omit({ quantity_on_hand: true });
type EditFormValues = z.infer<typeof editSchema>;

const receiveSchema = z.object({
  quantity: z.coerce.number().int().positive('Must be at least 1').max(100_000),
  vendor_name: optionalText(120),
});
type ReceiveFormValues = z.infer<typeof receiveSchema>;

// ----------------------------------------------------------------------------
// Status badge helper
// ----------------------------------------------------------------------------
function statusBadge(p: PartInventoryItem) {
  const qty = Number(p.quantity_on_hand);
  const min = Number(p.min_threshold);
  if (qty <= 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Out of Stock
      </Badge>
    );
  }
  if (qty <= min) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
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

// ----------------------------------------------------------------------------
// Add Part dialog
// ----------------------------------------------------------------------------
function AddPartDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreatePart();
  const form = useForm<PartFormValues>({
    resolver: zodResolver(partSchema),
    defaultValues: {
      part_name: '',
      part_number: '',
      vendor_name: '',
      category: '',
      unit: 'ea',
      quantity_on_hand: 0,
      min_threshold: 0,
    },
  });

  const onSubmit = (values: PartFormValues) => {
    create.mutate(values as CreatePartInput, {
      onSuccess: () => {
        toast.success(`${values.part_name} added to inventory`);
        form.reset();
        onOpenChange(false);
      },
      onError: (err: any) => toast.error(err?.message ?? 'Failed to add part'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Part</DialogTitle>
          <DialogDescription>Create a new inventory item.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="part_name">Part Name *</Label>
            <Input id="part_name" {...form.register('part_name')} />
            {form.formState.errors.part_name && (
              <p className="text-xs text-destructive">{form.formState.errors.part_name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="part_number">Part Number</Label>
              <Input id="part_number" {...form.register('part_number')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input id="category" placeholder="e.g. Fluids, Filters" {...form.register('category')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor_name">Vendor / Purchased From</Label>
            <Input id="vendor_name" placeholder="e.g. NAPA Auto Parts" {...form.register('vendor_name')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity_on_hand">Quantity *</Label>
              <Input id="quantity_on_hand" type="number" min={0} step={1} {...form.register('quantity_on_hand')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_threshold">Min Threshold *</Label>
              <Input id="min_threshold" type="number" min={0} step={1} {...form.register('min_threshold')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" placeholder="ea, qt, gal" {...form.register('unit')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Add Part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Edit Part dialog
// ----------------------------------------------------------------------------
function EditPartDialog({
  part,
  open,
  onOpenChange,
}: {
  part: PartInventoryItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const update = useUpdatePart();
  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    values: part
      ? {
          part_name: part.part_name,
          part_number: part.part_number ?? '',
          vendor_name: part.vendor_name ?? '',
          category: part.category ?? '',
          unit: part.unit ?? 'ea',
          min_threshold: Number(part.min_threshold),
        }
      : undefined,
  });

  if (!part) return null;

  const onSubmit = (values: EditFormValues) => {
    update.mutate(
      { id: part.id, ...values },
      {
        onSuccess: () => {
          toast.success('Part updated');
          onOpenChange(false);
        },
        onError: (err: any) => toast.error(err?.message ?? 'Update failed'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Part</DialogTitle>
          <DialogDescription>Update vendor, part number, or threshold.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_part_name">Part Name *</Label>
            <Input id="edit_part_name" {...form.register('part_name')} />
            {form.formState.errors.part_name && (
              <p className="text-xs text-destructive">{form.formState.errors.part_name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit_part_number">Part Number</Label>
              <Input id="edit_part_number" {...form.register('part_number')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_category">Category</Label>
              <Input id="edit_category" {...form.register('category')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_vendor">Vendor / Purchased From</Label>
            <Input id="edit_vendor" {...form.register('vendor_name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit_min">Min Threshold</Label>
              <Input id="edit_min" type="number" min={0} step={1} {...form.register('min_threshold')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_unit">Unit</Label>
              <Input id="edit_unit" {...form.register('unit')} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            To change quantity, use <strong>Receive Shipment</strong> from the actions menu.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Receive Shipment dialog
// ----------------------------------------------------------------------------
function ReceiveShipmentDialog({
  part,
  open,
  onOpenChange,
}: {
  part: PartInventoryItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const receive = useReceiveShipment();
  const form = useForm<ReceiveFormValues>({
    resolver: zodResolver(receiveSchema),
    defaultValues: { quantity: 1, vendor_name: '' },
  });
  const watchedQty = form.watch('quantity');

  if (!part) return null;

  const currentQty = Number(part.quantity_on_hand);
  const addQty = Number(watchedQty) || 0;
  const projected = currentQty + addQty;

  const onSubmit = (values: ReceiveFormValues) => {
    receive.mutate(
      { id: part.id, quantity: values.quantity, vendor_name: values.vendor_name },
      {
        onSuccess: () => {
          toast.success(`Received ${values.quantity} ${part.unit} of ${part.part_name}`);
          form.reset({ quantity: 1, vendor_name: '' });
          onOpenChange(false);
        },
        onError: (err: any) => toast.error(err?.message ?? 'Could not receive shipment'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Shipment</DialogTitle>
          <DialogDescription>{part.part_name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receive_qty">Quantity to add *</Label>
            <Input id="receive_qty" type="number" min={1} step={1} {...form.register('quantity')} />
            {form.formState.errors.quantity && (
              <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="receive_vendor">Vendor (optional)</Label>
            <Input
              id="receive_vendor"
              placeholder={part.vendor_name ?? 'Leave blank to keep current'}
              {...form.register('vendor_name')}
            />
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            Current: <strong>{currentQty}</strong> {part.unit}
            <span className="mx-2 text-muted-foreground">→</span>
            New: <strong className="text-emerald-600 dark:text-emerald-400">{projected}</strong> {part.unit}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={receive.isPending}>
              {receive.isPending ? 'Receiving…' : 'Confirm Receipt'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Main Tab
// ----------------------------------------------------------------------------
export function InventoryManagementTab() {
  const { data, isLoading } = useAllPartsInventory();
  const del = useDeletePart();

  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editPart, setEditPart] = useState<PartInventoryItem | null>(null);
  const [receivePart, setReceivePart] = useState<PartInventoryItem | null>(null);
  const [deletePart, setDeletePartState] = useState<PartInventoryItem | null>(null);

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

  const handleDelete = () => {
    if (!deletePart) return;
    del.mutate(deletePart.id, {
      onSuccess: () => {
        toast.success(`${deletePart.part_name} deleted`);
        setDeletePartState(null);
      },
      onError: (err: any) => toast.error(err?.message ?? 'Delete failed'),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header: search + add */}
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
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground hidden sm:block">
            {isLoading
              ? 'Loading…'
              : query
                ? `${filtered.length} of ${parts.length}`
                : `${parts.length} part${parts.length === 1 ? '' : 's'}`}
          </p>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add New Part
          </Button>
        </div>
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
                      ? 'No inventory yet. Click "Add New Part" to get started.'
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
                          <DropdownMenuItem onClick={() => setReceivePart(p)}>
                            Receive Shipment
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditPart(p)}>
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletePartState(p)}
                            className="text-destructive focus:text-destructive"
                          >
                            Delete Part
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

      <AddPartDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditPartDialog
        part={editPart}
        open={!!editPart}
        onOpenChange={v => !v && setEditPart(null)}
      />
      <ReceiveShipmentDialog
        part={receivePart}
        open={!!receivePart}
        onOpenChange={v => !v && setReceivePart(null)}
      />

      <AlertDialog open={!!deletePart} onOpenChange={v => !v && setDeletePartState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this part?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePart?.part_name} will be permanently removed from your inventory. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default InventoryManagementTab;
