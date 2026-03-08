import { useState, useMemo } from 'react';
import { useServiceHistory, useUpdateCompletedWorkOrder, useDeleteCompletedWorkOrder, useTrucks } from '@/hooks/useMaintenanceData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { Search, History, Pencil, Trash2, Loader2, ChevronDown, X, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { toast } from 'sonner';

interface ServiceType {
  value: string;
  label: string;
  description?: string;
}

// Freightliner Cascadia Schedule II service types
const FREIGHTLINER_SERVICE_TYPES: ServiceType[] = [
  { value: 'M1', label: 'M1 Service (Safety & Grease)', description: '25,000 mi interval' },
  { value: 'PM_A', label: 'PM A (Oil & Fuel)', description: '50,000 mi interval' },
  { value: 'M2', label: 'M2 Service (Annual)', description: '100,000 mi interval' },
  { value: 'M3', label: 'M3 Service (Major Fluids)', description: '300,000 mi interval' },
];

// Generic service types for non-Freightliner trucks
const GENERIC_SERVICE_TYPES: ServiceType[] = [
  { value: 'pm', label: 'Preventive Maintenance (PM)' },
  { value: 'repair', label: 'Repair' },
  { value: 'tire', label: 'Tire Service' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

// Additional types for Freightliner (in addition to M-services)
const FREIGHTLINER_ADDITIONAL_TYPES: ServiceType[] = [
  { value: 'repair', label: 'Repair' },
  { value: 'tire', label: 'Tire Service' },
  { value: 'inspection', label: '120-Day Inspection' },
  { value: 'other', label: 'Other' },
];

interface ServiceHistoryItem {
  id: string;
  truckId: string;
  date: string;
  unitNumber: string;
  serviceType: string;
  serviceTypes?: string[] | null;
  vendor: string | null;
  cost: number | null;
  description: string | null;
  source: 'work_order' | 'maintenance_log';
}

interface ServiceHistoryTabProps {
  onViewTruck: (truckId: string) => void;
}

export function ServiceHistoryTab({ onViewTruck }: ServiceHistoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [editingItem, setEditingItem] = useState<ServiceHistoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<ServiceHistoryItem | null>(null);
  const [serviceTypesOpen, setServiceTypesOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    entry_date: '',
    vendor: '',
    final_cost: '',
    description: '',
    service_types: [] as string[],
  });
  
  const { data: history, isLoading } = useServiceHistory(debouncedQuery || undefined);
  const { data: trucks } = useTrucks();
  const updateWorkOrder = useUpdateCompletedWorkOrder();
  const deleteWorkOrder = useDeleteCompletedWorkOrder();

  // Get truck make for the item being edited
  const editingTruck = useMemo(() => {
    if (!editingItem || !trucks) return null;
    return trucks.find(t => t.id === editingItem.truckId);
  }, [editingItem, trucks]);

  const isFreightliner = useMemo(() => {
    return editingTruck?.make?.toLowerCase() === 'freightliner';
  }, [editingTruck]);

  // Get service types based on manufacturer
  const serviceTypes = useMemo(() => {
    if (isFreightliner) {
      return {
        pmTypes: FREIGHTLINER_SERVICE_TYPES,
        otherTypes: FREIGHTLINER_ADDITIONAL_TYPES,
      };
    }
    return {
      pmTypes: [],
      otherTypes: GENERIC_SERVICE_TYPES,
    };
  }, [isFreightliner]);

  const allServiceTypes = useMemo(() => {
    return [...serviceTypes.pmTypes, ...serviceTypes.otherTypes];
  }, [serviceTypes]);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value);
  }, 300);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    debouncedSearch(value);
  };

  const handleEdit = (item: ServiceHistoryItem) => {
    setEditingItem(item);
    // Parse the service types from the comma-separated string or use the array
    const types = item.serviceTypes || item.serviceType.split(',').map(t => t.trim()).filter(Boolean);
    setEditForm({
      entry_date: item.date,
      vendor: item.vendor || '',
      final_cost: item.cost?.toString() || '',
      description: item.description || '',
      service_types: types,
    });
  };

  const toggleServiceType = (value: string) => {
    setEditForm(prev => {
      const newTypes = prev.service_types.includes(value)
        ? prev.service_types.filter(t => t !== value)
        : [...prev.service_types, value];
      return { ...prev, service_types: newTypes };
    });
  };

  const removeServiceType = (value: string) => {
    setEditForm(prev => ({
      ...prev,
      service_types: prev.service_types.filter(t => t !== value),
    }));
  };

  const getServiceLabel = (value: string) => {
    const type = allServiceTypes.find(t => t.value === value);
    return type?.label || value;
  };

  const getShortLabel = (value: string) => {
    const type = allServiceTypes.find(t => t.value === value);
    if (!type) return value;
    if (['M1', 'PM_A', 'M2', 'M3'].includes(value)) {
      return value === 'PM_A' ? 'PM A' : value;
    }
    return type.label.split(' ')[0];
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    if (editForm.service_types.length === 0) {
      toast.error('Please select at least one service type');
      return;
    }

    try {
      await updateWorkOrder.mutateAsync({
        id: editingItem.id,
        entry_date: editForm.entry_date,
        estimated_completion: editForm.entry_date,
        vendor: editForm.vendor || undefined,
        final_cost: editForm.final_cost ? parseFloat(editForm.final_cost) : undefined,
        description: editForm.description || undefined,
        service_type: editForm.service_types.join(', '),
        service_types: editForm.service_types,
      });
      toast.success('Service record updated');
      setEditingItem(null);
    } catch (error) {
      toast.error('Failed to update record');
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;

    try {
      await deleteWorkOrder.mutateAsync(deleteItem.id);
      toast.success('Service record deleted');
      setDeleteItem(null);
    } catch (error) {
      toast.error('Failed to delete record');
    }
  };

  const getServiceTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      pm: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      repair: 'bg-red-100 text-red-800 border-red-300',
      tire: 'bg-slate-100 text-slate-800 border-slate-300',
      inspection: 'bg-blue-100 text-blue-800 border-blue-300',
      'oil change': 'bg-amber-100 text-amber-800 border-amber-300',
    };
    const normalizedType = type.toLowerCase();
    return (
      <Badge variant="outline" className={cn('capitalize', colors[normalizedType] || '')}>
        {type}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by description, service type, vendor..."
          className="pl-10"
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !history?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <History className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Service History</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery 
              ? 'No records match your search criteria.'
              : 'Completed work orders and maintenance logs will appear here.'}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Unit #</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead className="max-w-[300px]">Description</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(item => (
                <TableRow 
                  key={`${item.source}-${item.id}`}
                >
                  <TableCell>
                    {format(new Date(item.date + 'T00:00:00'), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">{item.unitNumber}</TableCell>
                  <TableCell>{getServiceTypeBadge(item.serviceType)}</TableCell>
                  <TableCell>{item.vendor || '-'}</TableCell>
                  <TableCell>
                    {item.cost 
                      ? `$${item.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {item.description || '-'}
                  </TableCell>
                  <TableCell>
                    {item.source === 'work_order' && (
                      <div className="flex gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => handleEdit(item)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="text-destructive"
                          onClick={() => setDeleteItem(item)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Service Record</DialogTitle>
            <DialogDescription>
              Update the details of this service record.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-date">Service Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editForm.entry_date}
                onChange={(e) => setEditForm({ ...editForm, entry_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Service Types *
                {isFreightliner && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (Cascadia Schedule II)
                  </span>
                )}
              </Label>
              
              <Popover open={serviceTypesOpen} onOpenChange={setServiceTypesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={serviceTypesOpen}
                    className={cn(
                      "w-full justify-between h-auto min-h-10",
                      editForm.service_types.length === 0 && "text-muted-foreground"
                    )}
                  >
                    {editForm.service_types.length === 0 ? (
                      <span>Select service types...</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {editForm.service_types.map(type => (
                          <Badge
                            key={type}
                            variant="secondary"
                            className="mr-1 mb-1"
                          >
                            {getShortLabel(type)}
                            <button
                              type="button"
                              className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeServiceType(type);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <div className="max-h-[300px] overflow-y-auto p-2">
                    {isFreightliner && serviceTypes.pmTypes.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          Freightliner PM Schedule
                        </div>
                        {serviceTypes.pmTypes.map(type => (
                          <div
                            key={type.value}
                            className="flex items-start space-x-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                            onClick={() => toggleServiceType(type.value)}
                          >
                            <Checkbox
                              id={`edit-${type.value}`}
                              checked={editForm.service_types.includes(type.value)}
                              onCheckedChange={() => toggleServiceType(type.value)}
                            />
                            <div className="grid gap-0.5 leading-none">
                              <label
                                htmlFor={`edit-${type.value}`}
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {type.label}
                              </label>
                              {type.description && (
                                <span className="text-xs text-muted-foreground">
                                  {type.description}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="my-2 border-t" />
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          Other Services
                        </div>
                      </>
                    )}
                    {serviceTypes.otherTypes.map(type => (
                      <div
                        key={type.value}
                        className="flex items-start space-x-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                        onClick={() => toggleServiceType(type.value)}
                      >
                        <Checkbox
                          id={`edit-${type.value}`}
                          checked={editForm.service_types.includes(type.value)}
                          onCheckedChange={() => toggleServiceType(type.value)}
                        />
                        <div className="grid gap-0.5 leading-none">
                          <label
                            htmlFor={`edit-${type.value}`}
                            className="text-sm font-medium leading-none cursor-pointer"
                          >
                            {type.label}
                          </label>
                          {type.description && (
                            <span className="text-xs text-muted-foreground">
                              {type.description}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-vendor">Vendor</Label>
              <Input
                id="edit-vendor"
                value={editForm.vendor}
                onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                placeholder="Vendor name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-cost">Cost</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="edit-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7"
                  value={editForm.final_cost}
                  onChange={(e) => setEditForm({ ...editForm, final_cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Service description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateWorkOrder.isPending}>
              {updateWorkOrder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this service record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteWorkOrder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}