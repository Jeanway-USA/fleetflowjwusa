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
import { Loader2, AlertTriangle, CheckCircle, Truck, Wrench, Gauge, Package, Shield, WifiOff, Camera, X } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { useOfflineSync } from '@/hooks/useOfflineSync';

interface PostTripFormProps {
  driverId: string;
  truckId: string;
  onComplete: () => void;
}

// Post-Trip Inspection Categories and Items
const POST_TRIP_SECTIONS = [
  {
    id: 'exterior',
    title: '1. Exterior & Undercarriage',
    icon: Truck,
    items: [
      { id: 'ext_tires', label: 'Tires - no cuts, bulges, low tread' },
      { id: 'ext_wheels', label: 'Wheels/rims - no damage' },
      { id: 'ext_inflation', label: 'Proper tire inflation' },
      { id: 'ext_lug_nuts', label: 'All lug nuts present and tight' },
      { id: 'ext_seals', label: 'No leaking wheel seals' },
      { id: 'ext_headlights', label: 'Headlights working' },
      { id: 'ext_signals', label: 'Turn signals working' },
      { id: 'ext_brake_lights', label: 'Brake lights working' },
      { id: 'ext_clearance', label: 'Clearance/marker lights working' },
      { id: 'ext_reflectors', label: 'Reflectors intact' },
      { id: 'ext_fifth_wheel', label: 'Fifth wheel secure, no damage' },
      { id: 'ext_pintle', label: 'Pintle hook secure (if applicable)' },
      { id: 'ext_chains', label: 'Safety chains secure' },
      { id: 'ext_glad_hands', label: 'Glad hands - no damage or leaks' },
      { id: 'ext_springs', label: 'Suspension springs intact' },
      { id: 'ext_ubolts', label: 'U-bolts tight' },
      { id: 'ext_torque_rods', label: 'Torque rods secure' },
      { id: 'ext_pushrod', label: 'Brake pushrod travel within limits' },
      { id: 'ext_drums', label: 'Brake drums - no cracks' },
      { id: 'ext_chambers', label: 'Air chambers - no leaks' },
      { id: 'ext_oil_leak', label: 'No oil leaks under engine/chassis' },
      { id: 'ext_coolant_leak', label: 'No coolant leaks' },
      { id: 'ext_fuel_leak', label: 'No fuel leaks' },
    ],
  },
  {
    id: 'engine',
    title: '2. Engine Compartment (Visual)',
    icon: Wrench,
    items: [
      { id: 'eng_oil', label: 'Oil level adequate (engine cool)' },
      { id: 'eng_coolant', label: 'Coolant level adequate (engine cool)' },
      { id: 'eng_washer', label: 'Windshield washer fluid adequate' },
      { id: 'eng_belts', label: 'Belts - no cracks or fraying' },
      { id: 'eng_hoses', label: 'Hoses - no cracks or bulges' },
      { id: 'eng_battery_terminals', label: 'Battery terminals clean' },
      { id: 'eng_battery_secure', label: 'Battery secure' },
    ],
  },
  {
    id: 'interior',
    title: '3. Interior & Controls',
    icon: Gauge,
    items: [
      { id: 'int_air_gauge', label: 'Air pressure gauge normal' },
      { id: 'int_oil_gauge', label: 'Oil pressure gauge normal' },
      { id: 'int_temp_gauge', label: 'Water temperature gauge normal' },
      { id: 'int_horn', label: 'Horn working' },
      { id: 'int_wipers', label: 'Wipers working' },
      { id: 'int_defroster', label: 'Defroster working' },
      { id: 'int_mirrors', label: 'Mirrors adjusted and secure' },
    ],
  },
  {
    id: 'safety',
    title: '4. Safety Equipment',
    icon: Shield,
    items: [
      { id: 'safe_fire_ext', label: 'Fire extinguisher present' },
      { id: 'safe_first_aid', label: 'First aid kit present' },
      { id: 'safe_triangles', label: 'Warning triangles present' },
    ],
  },
  {
    id: 'cargo',
    title: '5. Load & Securement',
    icon: Package,
    items: [
      { id: 'cargo_secure', label: 'All cargo secure' },
      { id: 'cargo_blocked', label: 'Cargo properly blocked' },
      { id: 'cargo_braced', label: 'Cargo properly braced' },
      { id: 'cargo_tied', label: 'Cargo properly tied down' },
      { id: 'cargo_doors', label: 'Trailer doors secure' },
    ],
  },
];

export function PostTripForm({ driverId, truckId, onComplete }: PostTripFormProps) {
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
    POST_TRIP_SECTIONS.forEach(section => {
      section.items.forEach(item => {
        initial[item.id] = false;
      });
    });
    return initial;
  });

  // Calculate completion stats
  const totalItems = POST_TRIP_SECTIONS.reduce((acc, s) => acc + s.items.length, 0);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const allChecked = checkedCount === totalItems;

  const getSectionProgress = (sectionId: string) => {
    const section = POST_TRIP_SECTIONS.find(s => s.id === sectionId);
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
      let signatureUrl: string | null = null;
      if (signatureDataUrl) {
        signatureUrl = await uploadSignature(signatureDataUrl);
      }

      const photoUrls = await uploadPhotos();

      const { data: inspection, error } = await (supabase.from('driver_inspections' as any) as any)
        .insert({
          driver_id: driverId,
          truck_id: truckId,
          inspection_type: 'post_trip',
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
      toast.success('Post-trip inspection submitted successfully');
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

    if (!isOnline) {
      savePendingInspection({
        data: {
          driver_id: driverId,
          truck_id: truckId,
          inspection_type: 'post_trip',
          odometer_reading: odometer ? parseInt(odometer) : null,
          defects_found: defectsFound,
          defect_notes: defectsFound ? defectNotes : null,
          signature_url: null,
        },
        photos: [],
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
      <Accordion type="multiple" className="w-full" defaultValue={['exterior']}>
        {POST_TRIP_SECTIONS.map((section) => {
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                        className="absolute top-1 right-1 h-7 w-7"
                        onClick={() => removePhoto(index)}
                      >
                        <X className="h-4 w-4" />
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
            Submit Post-Trip Inspection
          </>
        )}
      </Button>
    </form>
  );
}
