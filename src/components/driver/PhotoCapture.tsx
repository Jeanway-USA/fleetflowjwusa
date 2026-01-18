import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PhotoCaptureProps {
  onPhotosCaptured: (urls: string[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
}

export function PhotoCapture({ onPhotosCaptured, disabled, maxPhotos = 5 }: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: { file: File; preview: string }[] = [];
    const remaining = maxPhotos - photos.length;

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
    if (inputRef.current) {
      inputRef.current.value = '';
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

  const uploadPhotos = async (): Promise<string[]> => {
    if (photos.length === 0) return [];

    setUploading(true);
    const urls: string[] = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const photo of photos) {
        const fileName = `${user.id}/${Date.now()}-${photo.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('dvir-photos')
          .upload(fileName, photo.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('dvir-photos')
          .getPublicUrl(fileName);

        urls.push(publicUrl);
      }

      onPhotosCaptured(urls);
      
      // Clean up previews
      photos.forEach(p => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      
      return urls;
    } catch (error: any) {
      toast.error('Failed to upload photos: ' + error.message);
      return [];
    } finally {
      setUploading(false);
    }
  };

  // Expose upload function via ref or callback
  // For simplicity, we'll call it when parent requests
  // We'll use useEffect to notify parent when photos change
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Defect Photos</span>
        <span className="text-xs text-muted-foreground">{photos.length}/{maxPhotos}</span>
      </div>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
              <img 
                src={photo.preview} 
                alt={`Defect photo ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6"
                onClick={() => removePhoto(index)}
                disabled={disabled || uploading}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add Photo Button */}
      {photos.length < maxPhotos && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Take Photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.removeAttribute('capture');
                inputRef.current.click();
              }
            }}
            disabled={disabled || uploading}
            className="flex-1"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Gallery
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Upload indicator */}
      {photos.length > 0 && !uploading && (
        <p className="text-xs text-muted-foreground">
          Photos will be uploaded when you submit the inspection.
        </p>
      )}
    </div>
  );
}

// Export a hook to handle photo uploads
export function usePhotoUpload() {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const addPhoto = (file: File) => {
    setPhotos(prev => [...prev, {
      file,
      preview: URL.createObjectURL(file),
    }]);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const uploadAll = async (): Promise<string[]> => {
    if (photos.length === 0) return [];
    
    setUploading(true);
    const urls: string[] = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const photo of photos) {
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('dvir-photos')
          .upload(fileName, photo.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('dvir-photos')
          .getPublicUrl(fileName);

        urls.push(publicUrl);
      }

      // Clean up
      photos.forEach(p => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      
      return urls;
    } catch (error: any) {
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
  };

  return { photos, addPhoto, removePhoto, uploadAll, uploading, clear };
}
