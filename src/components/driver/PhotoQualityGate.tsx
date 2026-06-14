import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Check } from 'lucide-react';

interface PhotoQualityGateProps {
  open: boolean;
  file: File | null;
  onRetake: () => void;
  onConfirm: () => void;
}

/**
 * Full-screen "Quality Gate" modal that forces the driver to visually
 * confirm a captured document photo is readable before any compression
 * or upload happens.
 */
export function PhotoQualityGate({ open, file, onRetake, onConfirm }: PhotoQualityGateProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onRetake(); }}>
      <DialogContent
        className="p-0 gap-0 max-w-3xl w-screen h-[100dvh] sm:h-auto sm:max-h-[95vh] sm:w-auto sm:rounded-lg flex flex-col bg-background"
      >
        <div className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 border-b">
          <DialogTitle className="text-lg sm:text-xl">
            Is this document clearly readable?
          </DialogTitle>
          <DialogDescription className="text-sm">
            Check that all text, dates, and signatures are sharp and fully in-frame.
          </DialogDescription>
        </div>

        <div className="flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Document preview"
              className="max-w-full max-h-full object-contain"
            />
          ) : null}
        </div>

        <div className="p-4 sm:p-6 border-t flex flex-col sm:flex-row gap-3 sm:justify-end bg-background">
          <Button
            type="button"
            variant="outline"
            className="h-14 sm:h-12 text-base order-2 sm:order-1"
            onClick={onRetake}
          >
            <Camera className="h-5 w-5 mr-2" />
            Retake Photo
          </Button>
          <Button
            type="button"
            className="h-14 sm:h-12 text-base order-1 sm:order-2"
            onClick={onConfirm}
          >
            <Check className="h-5 w-5 mr-2" />
            Looks Good, Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
