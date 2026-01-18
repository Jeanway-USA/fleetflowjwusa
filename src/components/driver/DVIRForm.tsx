import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

interface DVIRFormProps {
  type: 'pre_trip' | 'post_trip';
  driverId: string;
  truckId: string;
  onComplete: () => void;
}

const INSPECTION_ITEMS = [
  { id: 'brakes', label: 'Brakes' },
  { id: 'lights', label: 'Lights & Reflectors' },
  { id: 'tires', label: 'Tires & Wheels' },
  { id: 'mirrors', label: 'Mirrors' },
  { id: 'horn', label: 'Horn' },
  { id: 'wipers', label: 'Windshield & Wipers' },
  { id: 'steering', label: 'Steering' },
  { id: 'coupling', label: 'Coupling Devices' },
  { id: 'emergency', label: 'Emergency Equipment' },
  { id: 'fuel', label: 'Fuel System' },
  { id: 'exhaust', label: 'Exhaust System' },
  { id: 'fluids', label: 'Fluid Levels' },
];

export function DVIRForm({ type, driverId, truckId, onComplete }: DVIRFormProps) {
  const queryClient = useQueryClient();
  const [odometer, setOdometer] = useState('');
  const [defectsFound, setDefectsFound] = useState(false);
  const [defectNotes, setDefectNotes] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(
    Object.fromEntries(INSPECTION_ITEMS.map(item => [item.id, false]))
  );
  const [confirmed, setConfirmed] = useState(false);

  const allChecked = Object.values(checkedItems).every(Boolean);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('driver_inspections').insert({
        driver_id: driverId,
        truck_id: truckId,
        inspection_type: type,
        odometer_reading: odometer ? parseInt(odometer) : null,
        defects_found: defectsFound,
        defect_notes: defectsFound ? defectNotes : null,
        signature: 'Digital signature confirmed',
        status: defectsFound ? 'submitted' : 'cleared',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-inspections-today'] });
      toast.success(`${type === 'pre_trip' ? 'Pre-trip' : 'Post-trip'} inspection submitted`);
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to submit inspection: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allChecked) {
      toast.error('Please check all inspection items');
      return;
    }
    if (!confirmed) {
      toast.error('Please confirm the inspection is complete');
      return;
    }
    submitMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Odometer */}
      <div className="space-y-2">
        <Label htmlFor="odometer">Current Odometer Reading</Label>
        <Input
          id="odometer"
          type="number"
          placeholder="Enter miles"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          className="text-lg"
        />
      </div>

      {/* Inspection Checklist */}
      <div className="space-y-3">
        <Label>Inspection Checklist</Label>
        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
          {INSPECTION_ITEMS.map((item) => (
            <div key={item.id} className="flex items-center space-x-3">
              <Checkbox
                id={item.id}
                checked={checkedItems[item.id]}
                onCheckedChange={(checked) =>
                  setCheckedItems((prev) => ({ ...prev, [item.id]: !!checked }))
                }
              />
              <Label htmlFor={item.id} className="text-sm cursor-pointer">
                {item.label}
              </Label>
            </div>
          ))}
        </div>
        {!allChecked && (
          <p className="text-xs text-muted-foreground">
            Check all items to confirm inspection
          </p>
        )}
      </div>

      {/* Defects Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <Checkbox
            id="defects"
            checked={defectsFound}
            onCheckedChange={(checked) => setDefectsFound(!!checked)}
          />
          <Label htmlFor="defects" className="flex items-center gap-2 cursor-pointer">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Defects Found
          </Label>
        </div>

        {defectsFound && (
          <div className="space-y-2 animate-in slide-in-from-top-2">
            <Label htmlFor="defectNotes">Describe Defects</Label>
            <Textarea
              id="defectNotes"
              placeholder="Describe any defects found..."
              value={defectNotes}
              onChange={(e) => setDefectNotes(e.target.value)}
              rows={3}
              required={defectsFound}
            />
          </div>
        )}
      </div>

      {/* Confirmation */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center space-x-3">
          <Checkbox
            id="confirm"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(!!checked)}
          />
          <Label htmlFor="confirm" className="text-sm cursor-pointer">
            I certify that I have performed this inspection and the information above is accurate.
          </Label>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-12"
        disabled={!allChecked || !confirmed || submitMutation.isPending}
      >
        {submitMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            Submit {type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} Inspection
          </>
        )}
      </Button>
    </form>
  );
}
