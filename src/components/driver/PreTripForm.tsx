import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, CheckCircle, Wrench, Truck, Gauge, Shield, Link, WifiOff, Camera, X } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { useOfflineSync } from '@/hooks/useOfflineSync';

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
  const { isOnline, savePendingInspection } = useOfflineSync();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [odometer, setOdometer] = useState('');
  const [defectsFound, setDefectsFound] = useState(false);
  const [defectNotes, setDefectNotes] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);

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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newPhotos: { file: File; preview: string }[] = [];
    const remaining = 5 - photos.length;
    
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        newPhotos.push({
          file,
          preview: URL.createObjectURL(file),
        });
      }
    }
    
    setPhotos(prev => [...prev, ...newPhotos]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const uploadSignature = async (dataUrl: string): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const filePath = `${user.id}/${Date.now()}-signature.png`;

      const { error } = await supabase.storage
        .from('dvir-signatures')
        .upload(filePath, blob, { contentType: 'image/png' });

      if (error) throw error;

      // Return the storage path (not public URL) for private bucket
      return filePath;
    } catch (error) {
      console.error('Failed to upload signature:', error);
      return null;
    }
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (photos.length === 0) return [];
    
    const paths: string[] = [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    for (const photo of photos) {
      try {
        const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const { error } = await supabase.storage
          .from('dvir-photos')
          .upload(filePath, photo.file);

        if (error) throw error;

        // Store the path (not public URL) for private bucket
        paths.push(filePath);
      } catch (error) {
        console.error('Failed to upload photo:', error);
      }
    }

    return paths;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Upload signature first
      let signatureUrl: string | null = null;
      if (signatureDataUrl) {
        signatureUrl = await uploadSignature(signatureDataUrl);
      }

      // Upload photos
      const photoUrls = await uploadPhotos();

      // Insert inspection
      const { data: inspection, error } = await (supabase.from('driver_inspections' as any) as any)
        .insert({
          driver_id: driverId,
          truck_id: truckId,
          inspection_type: 'pre_trip',
          odometer_reading: odometer ? parseInt(odometer) : null,
          defects_found: defectsFound,
          defect_notes: defectsFound ? defectNotes : null,
          signature: 'Digital signature confirmed',
          signature_url: signatureUrl,
          status: defectsFound ? 'submitted' : 'cleared',
        })
        .select()
        .single();

      if (error) throw error;

      // Insert photos if any
      if (photoUrls.length > 0 && inspection) {
        for (const url of photoUrls) {
          await (supabase.from('inspection_photos' as any) as any).insert({
            inspection_id: inspection.id,
            photo_url: url,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-inspections-today'] });
      queryClient.invalidateQueries({ queryKey: ['driver-inspections-history'] });
      toast.success('Pre-trip inspection submitted successfully');
      // Clean up photo previews
      photos.forEach(p => URL.revokeObjectURL(p.preview));
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
    if (!signatureDataUrl) {
      toast.error('Please provide your signature');
      return;
    }

    // Check if offline
    if (!isOnline) {
      savePendingInspection({
        data: {
          driver_id: driverId,
          truck_id: truckId,
          inspection_type: 'pre_trip',
          odometer_reading: odometer ? parseInt(odometer) : null,
          defects_found: defectsFound,
          defect_notes: defectsFound ? defectNotes : null,
          signature_url: null, // Can't upload signature offline
        },
        photos: [], // Can't store files in localStorage
      });
      onComplete();
      return;
    }

    submitMutation.mutate();
  };

  const setItemChecked = (itemId: string, checked: boolean) => {
    setCheckedItems(prev => ({ ...prev, [itemId]: checked }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Offline Warning */}
      {!isOnline && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-warning" />
          <span className="text-sm text-warning">
            You're offline. Inspection will be saved locally and synced when back online.
          </span>
        </div>
      )}

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
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                    >
                      <Checkbox
                        id={item.id}
                        checked={checkedItems[item.id]}
                        onCheckedChange={(checked) => setItemChecked(item.id, checked === true)}
                      />
                      <Label
                        htmlFor={item.id}
                        className="text-sm cursor-pointer flex-1"
                      >
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
            onCheckedChange={(checked) => setDefectsFound(checked === true)}
          />
          <Label htmlFor="defects" className="flex items-center gap-2 cursor-pointer">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Defects Found
          </Label>
        </div>

        {defectsFound && (
          <div className="space-y-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
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

            {/* Photo Capture for Defects */}
            <div className="space-y-2">
              <Label>Defect Photos ({photos.length}/5)</Label>
              {photos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img 
                        src={photo.preview} 
                        alt={`Defect ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-5 w-5"
                        onClick={() => removePhoto(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < 5 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Add Photo
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>
          </div>
        )}
      </div>

      {/* Signature Section */}
      <div className="border-t pt-4">
        {signatureDataUrl ? (
          <div className="space-y-2">
            <Label>Your Signature</Label>
            <div className="border rounded-lg p-2 bg-white">
              <img src={signatureDataUrl} alt="Signature" className="max-h-20 mx-auto" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSignatureDataUrl(null)}
            >
              Clear Signature
            </Button>
          </div>
        ) : (
          <SignaturePad onSignatureCapture={setSignatureDataUrl} />
        )}
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-12 gradient-gold text-primary-foreground"
        disabled={!allChecked || !signatureDataUrl || submitMutation.isPending}
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
