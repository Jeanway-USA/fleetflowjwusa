import { useState, useMemo, useRef } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCreateWorkOrder, useTrucks, useManufacturerPMProfiles, ManufacturerPMProfile } from '@/hooks/useMaintenanceData';
import { toast } from 'sonner';
import { Loader2, Plus, DollarSign, ChevronDown, X, Check, Search, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface WorkOrderInitialData {
  truck_id?: string;
  description?: string;
  service_types?: string[];
}

interface NewWorkOrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: WorkOrderInitialData;
}

interface ServiceType {
  value: string;
  label: string;
  description?: string;
  interval?: string;
}

// Manufacturer schedule display names
const MANUFACTURER_SCHEDULE_NAMES: Record<string, string> = {
  'freightliner': 'Cascadia Schedule II',
  'western star': 'Daimler M-System',
  'peterbilt': 'PACCAR Normal Duty',
  'kenworth': 'PACCAR Normal Duty',
  'international': 'Class A/B/C/D System',
  'volvo': 'VDS-4.5 Normal Duty',
  'mack': 'EOS-4.5 Normal Duty',
};

// Generic service types available for all trucks
const GENERIC_SERVICE_TYPES: ServiceType[] = [
  { value: 'repair', label: 'Repair' },
  { value: 'tire', label: 'Tire Service' },
  { value: 'inspection', label: '120-Day Inspection' },
  { value: 'other', label: 'Other' },
];

export function NewWorkOrderSheet({ open, onOpenChange, initialData }: NewWorkOrderSheetProps) {
  const { data: trucks } = useTrucks();
  const { data: pmProfiles } = useManufacturerPMProfiles();
  const createWorkOrder = useCreateWorkOrder();
  const [serviceTypesOpen, setServiceTypesOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const vehicleListRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    truck_id: '',
    service_types: [] as string[],
    vendor: '',
    odometer_reading: '',
    cost_estimate: '',
    estimated_completion: '',
    description: '',
    is_reimbursable: false,
  });

  // Find selected truck
  const selectedTruck = useMemo(() => {
    return trucks?.find(t => t.id === formData.truck_id);
  }, [trucks, formData.truck_id]);

  // Get manufacturer key (normalized)
  const manufacturerKey = useMemo(() => {
    return (selectedTruck?.make || '').trim().toLowerCase();
  }, [selectedTruck]);

  // Get schedule name for selected manufacturer
  const scheduleName = useMemo(() => {
    return MANUFACTURER_SCHEDULE_NAMES[manufacturerKey] || null;
  }, [manufacturerKey]);

  // Group and filter trucks for the searchable list
  const groupedTrucks = useMemo(() => {
    if (!trucks) return { groups: {}, all: [] };

    const filtered = vehicleSearch.trim()
      ? trucks.filter(t => {
          const search = vehicleSearch.toLowerCase();
          return (
            t.unit_number.toLowerCase().includes(search) ||
            (t.make || '').toLowerCase().includes(search) ||
            (t.model || '').toLowerCase().includes(search)
          );
        })
      : trucks;

    // Group by manufacturer
    const groups: Record<string, typeof trucks> = {};
    filtered.forEach(truck => {
      const make = (truck.make || 'Other').trim();
      if (!groups[make]) groups[make] = [];
      groups[make].push(truck);
    });

    // Sort groups alphabetically
    const sortedGroups: Record<string, typeof trucks> = {};
    Object.keys(groups)
      .sort()
      .forEach(key => {
        sortedGroups[key] = groups[key].sort((a, b) => 
          a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
        );
      });

    return { groups: sortedGroups, all: filtered };
  }, [trucks, vehicleSearch]);

  // Flatten for virtualizer
  const flattenedTruckItems = useMemo(() => {
    const items: Array<{ type: 'header' | 'truck'; label?: string; truck?: typeof trucks extends (infer T)[] ? T : never }> = [];
    Object.entries(groupedTrucks.groups).forEach(([make, truckList]) => {
      items.push({ type: 'header', label: make });
      truckList.forEach(truck => {
        items.push({ type: 'truck', truck });
      });
    });
    return items;
  }, [groupedTrucks]);

  // Virtual scrolling for large truck lists
  const rowVirtualizer = useVirtualizer({
    count: flattenedTruckItems.length,
    getScrollElement: () => vehicleListRef.current,
    estimateSize: (index) => flattenedTruckItems[index].type === 'header' ? 32 : 40,
    overscan: 5,
  });

  // Get manufacturer-specific PM service types from database
  const manufacturerServiceTypes = useMemo((): ServiceType[] => {
    if (!pmProfiles || !manufacturerKey) return [];
    
    return pmProfiles
      .filter(p => p.manufacturer.toLowerCase() === manufacturerKey)
      .map(p => ({
        value: p.service_code,
        label: `${p.service_code.replace('_', ' ')} (${p.service_name.replace(p.service_code.replace('_', ' ') + ' ', '').replace('(', '').replace(')', '')})`,
        description: p.description || undefined,
        interval: p.interval_miles ? `${p.interval_miles.toLocaleString()} mi` : undefined,
      }));
  }, [pmProfiles, manufacturerKey]);

  // All available service types for the selected truck
  const allServiceTypes = useMemo(() => {
    return [...manufacturerServiceTypes, ...GENERIC_SERVICE_TYPES];
  }, [manufacturerServiceTypes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.truck_id) {
      toast.error('Please select a vehicle');
      return;
    }

    if (formData.service_types.length === 0) {
      toast.error('Please select at least one service type');
      return;
    }

    try {
      await createWorkOrder.mutateAsync({
        truck_id: formData.truck_id,
        service_types: formData.service_types,
        service_type: formData.service_types.join(', '),
        vendor: formData.vendor || undefined,
        odometer_reading: formData.odometer_reading ? parseInt(formData.odometer_reading) : undefined,
        cost_estimate: formData.cost_estimate ? parseFloat(formData.cost_estimate) : undefined,
        estimated_completion: formData.estimated_completion || undefined,
        description: formData.description || undefined,
        is_reimbursable: formData.is_reimbursable,
      });

      toast.success('Work order created successfully');
      onOpenChange(false);
      
      // Reset form
      setFormData({
        truck_id: '',
        service_types: [],
        vendor: '',
        odometer_reading: '',
        cost_estimate: '',
        estimated_completion: '',
        description: '',
        is_reimbursable: false,
      });
      setVehicleSearch('');
    } catch (error) {
      console.error('Error creating work order:', error);
      toast.error('Failed to create work order');
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'truck_id') {
        updated.service_types = [];
      }
      return updated;
    });
  };

  const toggleServiceType = (value: string) => {
    setFormData(prev => {
      const newTypes = prev.service_types.includes(value)
        ? prev.service_types.filter(t => t !== value)
        : [...prev.service_types, value];
      return { ...prev, service_types: newTypes };
    });
  };

  const removeServiceType = (value: string) => {
    setFormData(prev => ({
      ...prev,
      service_types: prev.service_types.filter(t => t !== value),
    }));
  };

  const getShortLabel = (value: string) => {
    const type = allServiceTypes.find(t => t.value === value);
    if (!type) return value;
    // For service codes, format nicely
    if (value.includes('_')) {
      return value.replace('_', ' ');
    }
    return type.label.split(' ')[0];
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            New Work Order
          </SheetTitle>
          <SheetDescription>
            Create a new work order for vehicle maintenance or repair.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-6">
          <div className="space-y-4">
            {/* Searchable Vehicle Selector */}
            <div className="grid gap-2">
              <Label htmlFor="truck">Vehicle *</Label>
              <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vehicleOpen}
                    className={cn(
                      "w-full justify-between",
                      !formData.truck_id && "text-muted-foreground"
                    )}
                  >
                    {selectedTruck ? (
                      <span className="flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        <span className="font-medium">{selectedTruck.unit_number}</span>
                        {selectedTruck.make && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedTruck.make.trim()}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Select a vehicle...
                      </span>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Search by unit, make, or model..." 
                      value={vehicleSearch}
                      onValueChange={setVehicleSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No vehicles found.</CommandEmpty>
                      {groupedTrucks.all.length <= 50 ? (
                        // Non-virtualized for small lists
                        Object.entries(groupedTrucks.groups).map(([make, truckList]) => (
                          <CommandGroup key={make} heading={make}>
                            {truckList.map(truck => (
                              <CommandItem
                                key={truck.id}
                                value={truck.id}
                                onSelect={() => {
                                  handleChange('truck_id', truck.id);
                                  setVehicleOpen(false);
                                  setVehicleSearch('');
                                }}
                                className="flex items-center justify-between"
                              >
                                <span className="flex items-center gap-2">
                                  <Truck className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{truck.unit_number}</span>
                                  {truck.model && (
                                    <span className="text-muted-foreground text-sm">{truck.model}</span>
                                  )}
                                </span>
                                {formData.truck_id === truck.id && (
                                  <Check className="h-4 w-4" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))
                      ) : (
                        // Virtualized for large lists
                        <div
                          ref={vehicleListRef}
                          className="max-h-[300px] overflow-auto"
                        >
                          <div
                            style={{
                              height: `${rowVirtualizer.getTotalSize()}px`,
                              width: '100%',
                              position: 'relative',
                            }}
                          >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                              const item = flattenedTruckItems[virtualRow.index];
                              return (
                                <div
                                  key={virtualRow.index}
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                  }}
                                >
                                  {item.type === 'header' ? (
                                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
                                      {item.label}
                                    </div>
                                  ) : item.truck ? (
                                    <div
                                      className={cn(
                                        "flex items-center justify-between px-2 py-2 cursor-pointer hover:bg-accent",
                                        formData.truck_id === item.truck.id && "bg-accent"
                                      )}
                                      onClick={() => {
                                        handleChange('truck_id', item.truck!.id);
                                        setVehicleOpen(false);
                                        setVehicleSearch('');
                                      }}
                                    >
                                      <span className="flex items-center gap-2">
                                        <Truck className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{item.truck.unit_number}</span>
                                        {item.truck.model && (
                                          <span className="text-muted-foreground text-sm">{item.truck.model}</span>
                                        )}
                                      </span>
                                      {formData.truck_id === item.truck.id && (
                                        <Check className="h-4 w-4" />
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Service Types with Manufacturer-Specific Options */}
            <div className="grid gap-2">
              <Label>
                Service Types *
                {scheduleName && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({scheduleName})
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
                      formData.service_types.length === 0 && "text-muted-foreground"
                    )}
                    disabled={!formData.truck_id}
                  >
                    {formData.service_types.length === 0 ? (
                      <span>Select service types...</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {formData.service_types.map(type => (
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
                    {/* Manufacturer PM Services */}
                    {manufacturerServiceTypes.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          {scheduleName || 'Manufacturer PM Schedule'}
                        </div>
                        {manufacturerServiceTypes.map(type => (
                          <div
                            key={type.value}
                            className="flex items-start space-x-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                            onClick={() => toggleServiceType(type.value)}
                          >
                            <Checkbox
                              id={type.value}
                              checked={formData.service_types.includes(type.value)}
                              onCheckedChange={() => toggleServiceType(type.value)}
                            />
                            <div className="grid gap-0.5 leading-none flex-1">
                              <label
                                htmlFor={type.value}
                                className="text-sm font-medium leading-none cursor-pointer flex items-center justify-between"
                              >
                                <span>{type.label}</span>
                                {type.interval && (
                                  <span className="text-xs text-muted-foreground font-normal">
                                    {type.interval}
                                  </span>
                                )}
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
                      </>
                    )}
                    
                    {/* Generic Services */}
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Other Services
                    </div>
                    {GENERIC_SERVICE_TYPES.map(type => (
                      <div
                        key={type.value}
                        className="flex items-start space-x-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                        onClick={() => toggleServiceType(type.value)}
                      >
                        <Checkbox
                          id={type.value}
                          checked={formData.service_types.includes(type.value)}
                          onCheckedChange={() => toggleServiceType(type.value)}
                        />
                        <div className="grid gap-0.5 leading-none">
                          <label
                            htmlFor={type.value}
                            className="text-sm font-medium leading-none cursor-pointer"
                          >
                            {type.label}
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vendor">Vendor / Shop</Label>
              <Input
                id="vendor"
                placeholder="Enter vendor name"
                value={formData.vendor}
                onChange={(e) => handleChange('vendor', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="odometer">Odometer Reading</Label>
                <Input
                  id="odometer"
                  type="number"
                  placeholder="Current miles"
                  value={formData.odometer_reading}
                  onChange={(e) => handleChange('odometer_reading', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="costEstimate">Cost Estimate</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="costEstimate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    placeholder="0.00"
                    value={formData.cost_estimate}
                    onChange={(e) => handleChange('cost_estimate', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="estimatedCompletion">Estimated Completion Date</Label>
              <Input
                id="estimatedCompletion"
                type="date"
                value={formData.estimated_completion}
                onChange={(e) => handleChange('estimated_completion', e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the issue or service needed..."
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
              />
            </div>

            {/* Reimbursable Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
              <div className="space-y-0.5">
                <Label htmlFor="reimbursable" className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                  Reimbursable / Warranty
                </Label>
                <p className="text-xs text-muted-foreground">
                  Mark this if the cost will be reimbursed or covered by warranty
                </p>
              </div>
              <Switch
                id="reimbursable"
                checked={formData.is_reimbursable}
                onCheckedChange={(checked) => handleChange('is_reimbursable', checked)}
              />
            </div>
          </div>

          <SheetFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createWorkOrder.isPending}
              className="gap-2"
            >
              {createWorkOrder.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Work Order
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
