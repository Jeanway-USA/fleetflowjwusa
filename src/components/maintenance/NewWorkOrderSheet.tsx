import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateWorkOrder, useTrucks } from '@/hooks/useMaintenanceData';
import { toast } from 'sonner';
import { Loader2, Plus, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

interface NewWorkOrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function NewWorkOrderSheet({ open, onOpenChange }: NewWorkOrderSheetProps) {
  const { data: trucks } = useTrucks();
  const createWorkOrder = useCreateWorkOrder();

  const [formData, setFormData] = useState({
    truck_id: '',
    service_type: '',
    vendor: '',
    odometer_reading: '',
    cost_estimate: '',
    estimated_completion: '',
    description: '',
    is_reimbursable: false,
  });

  // Determine if selected truck is a Freightliner
  const selectedTruck = useMemo(() => {
    return trucks?.find(t => t.id === formData.truck_id);
  }, [trucks, formData.truck_id]);

  const isFreightliner = useMemo(() => {
    return selectedTruck?.make?.toLowerCase() === 'freightliner';
  }, [selectedTruck]);

  // Get service types based on manufacturer
  const serviceTypes = useMemo(() => {
    if (isFreightliner) {
      // Include both Freightliner-specific and generic types
      return [
        ...FREIGHTLINER_SERVICE_TYPES,
        { value: 'repair', label: 'Repair' },
        { value: 'tire', label: 'Tire Service' },
        { value: 'inspection', label: '120-Day Inspection' },
        { value: 'other', label: 'Other' },
      ];
    }
    return GENERIC_SERVICE_TYPES;
  }, [isFreightliner]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.truck_id) {
      toast.error('Please select a vehicle');
      return;
    }

    if (!formData.service_type) {
      toast.error('Please select a service type');
      return;
    }

    try {
      await createWorkOrder.mutateAsync({
        truck_id: formData.truck_id,
        service_type: formData.service_type,
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
        service_type: '',
        vendor: '',
        odometer_reading: '',
        cost_estimate: '',
        estimated_completion: '',
        description: '',
        is_reimbursable: false,
      });
    } catch (error) {
      console.error('Error creating work order:', error);
      toast.error('Failed to create work order');
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // Reset service_type when truck changes (manufacturer may differ)
      if (field === 'truck_id') {
        updated.service_type = '';
      }
      return updated;
    });
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
            <div className="grid gap-2">
              <Label htmlFor="truck">Vehicle *</Label>
              <Select
                value={formData.truck_id}
                onValueChange={(value) => handleChange('truck_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {trucks?.map(truck => (
                    <SelectItem key={truck.id} value={truck.id}>
                      {truck.unit_number} {truck.make && truck.model && `- ${truck.make} ${truck.model}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="serviceType">
                Service Type *
                {isFreightliner && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (Cascadia Schedule II)
                  </span>
                )}
              </Label>
              <Select
                value={formData.service_type}
                onValueChange={(value) => handleChange('service_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {isFreightliner && (
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Freightliner PM Schedule
                    </div>
                  )}
                  {serviceTypes.map((type: ServiceType) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col">
                        <span>{type.label}</span>
                        {type.description && (
                          <span className="text-xs text-muted-foreground">{type.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
