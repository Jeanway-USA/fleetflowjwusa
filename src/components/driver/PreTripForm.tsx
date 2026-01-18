import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, CheckCircle, Wrench, Truck, Gauge, Shield, Link } from 'lucide-react';

interface PreTripFormProps {
  driverId: string;
  truckId: string;
  onComplete: () => void;
}

// Pre-Trip Inspection Categories and Items
const PRE_TRIP_SECTIONS = [
  {
    id: 'engine',
    title: '1. Engine Compartment',
    icon: Wrench,
    items: [
      { id: 'engine_oil', label: 'Oil level adequate' },
      { id: 'engine_coolant', label: 'Coolant level adequate' },
      { id: 'engine_power_steering', label: 'Power steering fluid level adequate' },
      { id: 'engine_belts', label: 'Belts - no cracks, fraying, secure mounting' },
      { id: 'engine_hoses', label: 'Hoses - no cracks, bulges, leaks' },
      { id: 'engine_air_compressor', label: 'Air compressor secure, no leaks' },
      { id: 'engine_air_lines', label: 'Air lines secure, no damage' },
      { id: 'engine_air_filter', label: 'Air filter/water separator - secure, drained' },
      { id: 'engine_alternator', label: 'Alternator secure, wiring intact' },
    ],
  },
  {
    id: 'exterior',
    title: '2. Exterior & Undercarriage',
    icon: Truck,
    items: [
      { id: 'ext_tires_abc', label: 'Tires - no abrasions, bulges, cuts (ABCs)' },
      { id: 'ext_tires_tread', label: 'Tires - proper tread depth' },
      { id: 'ext_tires_inflation', label: 'Tires - proper inflation' },
      { id: 'ext_lug_nuts', label: 'Lug nuts secure and tight' },
      { id: 'ext_valve_stems', label: 'Valve stems capped' },
      { id: 'ext_brake_drums', label: 'Brake drums/pads - adequate lining thickness' },
      { id: 'ext_brake_chambers', label: 'Brake chambers secure, no damage' },
      { id: 'ext_slack_adjusters', label: 'Slack adjusters - proper angle/play' },
      { id: 'ext_brake_air_lines', label: 'Brake air lines - no damage or leaks' },
      { id: 'ext_suspension_springs', label: 'Suspension springs secure' },
      { id: 'ext_suspension_mounts', label: 'Suspension mounts/bushings secure' },
      { id: 'ext_shocks', label: 'Shock absorbers functional' },
      { id: 'ext_frame', label: 'Frame - no cracks, loose bolts' },
      { id: 'ext_body_mounts', label: 'Body mounts secure, no leaks' },
      { id: 'ext_headlights', label: 'Headlights clean, secure, working' },
      { id: 'ext_taillights', label: 'Tail lights clean, secure, working' },
      { id: 'ext_turn_signals', label: 'Turn signals working' },
      { id: 'ext_marker_lights', label: 'Marker/clearance lights working' },
      { id: 'ext_brake_lights', label: 'Brake lights working' },
      { id: 'ext_hazards', label: 'Hazard lights working' },
      { id: 'ext_reflectors', label: 'Reflectors clean and intact' },
    ],
  },
  {
    id: 'coupling',
    title: '3. Coupling (Fifth Wheel)',
    icon: Link,
    items: [
      { id: 'coup_platform', label: 'Fifth wheel platform secure' },
      { id: 'coup_apron', label: 'Apron in good condition' },
      { id: 'coup_kingpin', label: 'Kingpin secure, no damage' },
      { id: 'coup_locking_jaws', label: 'Locking jaws engaged properly' },
      { id: 'coup_connection', label: 'Tractor-trailer connection secure' },
      { id: 'coup_landing_gear', label: 'Landing gear fully raised and secure' },
      { id: 'coup_landing_crank', label: 'Landing gear crank functional' },
      { id: 'coup_trailer_frame', label: 'Trailer frame - structural integrity' },
      { id: 'coup_trailer_axles', label: 'Trailer axles secure' },
    ],
  },
  {
    id: 'incab',
    title: '4. In-Cab & Air Brake Test',
    icon: Gauge,
    items: [
      { id: 'cab_horn', label: 'Horn working' },
      { id: 'cab_lights_high', label: 'High beam lights working' },
      { id: 'cab_lights_low', label: 'Low beam lights working' },
      { id: 'cab_turn_signals', label: 'Turn signal indicators working' },
      { id: 'cab_flashers', label: 'Flashers/hazards working' },
      { id: 'cab_oil_gauge', label: 'Oil pressure gauge functional' },
      { id: 'cab_coolant_gauge', label: 'Coolant temp gauge functional' },
      { id: 'cab_air_gauge', label: 'Air pressure gauge functional' },
      { id: 'cab_brake_static', label: 'STATIC: Low air warning before 55 PSI' },
      { id: 'cab_brake_emergency', label: 'Emergency valve pops 20-45 PSI' },
      { id: 'cab_brake_applied', label: 'APPLIED: < 4 PSI loss in 1 min' },
      { id: 'cab_brake_low_pressure', label: 'LOW PRESSURE: Warning at/before 55 PSI' },
      { id: 'cab_brake_spring', label: 'SPRING BRAKES: Engage when air is fanned down' },
      { id: 'cab_brake_parking', label: 'Parking brake holds on incline' },
      { id: 'cab_brake_service', label: 'Service brakes stop vehicle (5 mph test)' },
    ],
  },
  {
    id: 'safety',
    title: '5. Safety Equipment',
    icon: Shield,
    items: [
      { id: 'safety_fire_ext', label: 'Fire extinguisher present, charged' },
      { id: 'safety_fuses', label: 'Spare fuses present' },
      { id: 'safety_triangles', label: 'Warning triangles/flares present' },
      { id: 'safety_first_aid', label: 'First aid kit present' },
      { id: 'safety_accessible', label: 'All safety equipment accessible' },
    ],
  },
];

export function PreTripForm({ driverId, truckId, onComplete }: PreTripFormProps) {
  const queryClient = useQueryClient();
  const [odometer, setOdometer] = useState('');
  const [defectsFound, setDefectsFound] = useState(false);
  const [defectNotes, setDefectNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Track checked items for each section
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    PRE_TRIP_SECTIONS.forEach(section => {
      section.items.forEach(item => {
        initial[item.id] = false;
      });
    });
    return initial;
  });

  // Calculate completion stats
  const totalItems = PRE_TRIP_SECTIONS.reduce((acc, s) => acc + s.items.length, 0);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const allChecked = checkedCount === totalItems;

  const getSectionProgress = (sectionId: string) => {
    const section = PRE_TRIP_SECTIONS.find(s => s.id === sectionId);
    if (!section) return { checked: 0, total: 0 };
    const sectionChecked = section.items.filter(item => checkedItems[item.id]).length;
    return { checked: sectionChecked, total: section.items.length };
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Type assertion needed because driver_inspections may not be in generated types yet
      const { error } = await (supabase.from('driver_inspections' as any) as any).insert({
        driver_id: driverId,
        truck_id: truckId,
        inspection_type: 'pre_trip',
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
      toast.success('Pre-trip inspection submitted successfully');
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to submit inspection: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allChecked) {
      toast.error('Please complete all inspection items');
      return;
    }
    if (!confirmed) {
      toast.error('Please confirm the inspection is complete');
      return;
    }
    submitMutation.mutate();
  };

  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Progress Summary */}
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Inspection Progress</span>
          <span className="text-sm text-muted-foreground">{checkedCount} / {totalItems}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300" 
            style={{ width: `${(checkedCount / totalItems) * 100}%` }}
          />
        </div>
      </div>

      {/* Odometer */}
      <div className="space-y-2">
        <Label htmlFor="odometer">Current Odometer Reading</Label>
        <Input
          id="odometer"
          type="number"
          placeholder="Enter miles"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
        />
      </div>

      {/* Inspection Sections */}
      <Accordion type="multiple" className="w-full" defaultValue={['engine']}>
        {PRE_TRIP_SECTIONS.map((section) => {
          const progress = getSectionProgress(section.id);
          const isComplete = progress.checked === progress.total;
          const Icon = section.icon;

          return (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{section.title}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                    isComplete 
                      ? 'bg-success/20 text-success' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {progress.checked}/{progress.total}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pl-2">
                  {section.items.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleItem(item.id)}
                    >
                      <Checkbox
                        id={item.id}
                        checked={checkedItems[item.id]}
                        onCheckedChange={() => toggleItem(item.id)}
                      />
                      <Label htmlFor={item.id} className="text-sm cursor-pointer flex-1">
                        {item.label}
                      </Label>
                      {checkedItems[item.id] && (
                        <CheckCircle className="h-4 w-4 text-success" />
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Defects Section */}
      <div className="space-y-3 border-t pt-4">
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
        <div className="flex items-start space-x-3">
          <Checkbox
            id="confirm"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(!!checked)}
            className="mt-0.5"
          />
          <Label htmlFor="confirm" className="text-sm cursor-pointer leading-relaxed">
            I certify that I have personally performed this pre-trip inspection in accordance with 
            FMCSA requirements and that the information above is true and accurate.
          </Label>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-12 gradient-gold text-primary-foreground"
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
            Submit Pre-Trip Inspection
          </>
        )}
      </Button>
    </form>
  );
}
